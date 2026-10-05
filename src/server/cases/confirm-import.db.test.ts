import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../../prisma/seed-data";
import { createTestClient, freeOfficeId } from "../../../tests/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, colomboDay, colomboYear, dateToDay } from "@/lib/dates";
import type { CaseValues } from "@/lib/validation/case";
import type { ConfirmField } from "@/lib/validation/confirm";
import { markInstallmentPaid } from "../installments/commands";
import { type Actor, saveCase } from "./commands";
import { confirmImported } from "./confirm-import";
import { fillImported } from "./imported";
import { countCases, getCase, officeMoney } from "./queries";
import { importedByDistrict, importedCount, listImported, listQueue } from "./queues";
import { reopenCase } from "./stop";

const db = createTestClient();
const KEY = "confirm-test:";

let ds: Actor;
let ho: Actor;
let officeCode: string;
let districtId: number;

const today = () => colomboDay(new Date());
const daysAgo = (n: number) => addDays(today(), -n);

/** A made-up case as the import leaves it (SEC-11), here with its kind already filled in by the office. */
async function imported(fields: Partial<Prisma.CaseUncheckedCreateInput> = {}) {
  const id = randomUUID();
  return db.case.create({
    data: {
      id,
      dsOfficeId: ds.dsOfficeId as number,
      category: "CARE_LEAVER",
      kind: "NEW_HOUSE",
      status: "IMPORTED",
      name: "තහවුරු පරීක්ෂණ",
      address: "නො. 2, පරීක්ෂණ පාර",
      createdById: ho.userId,
      sheetKey: `${KEY}${id}`,
      sheetRow: 10,
      ...fields,
    },
  });
}

const form = (values: Partial<Record<ConfirmField, string>>) =>
  new Proxy({} as Record<ConfirmField, string>, {
    get: (_target, field: string) => values[field as ConfirmField] ?? "",
  });

const confirm = (actor: Actor, c: { id: string; version: number }, values: Partial<Record<ConfirmField, string>>) =>
  confirmImported(db, actor, { caseId: c.id, version: c.version, form: form(values) });

const load = (id: string) => db.case.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  await seed(db);
  const dsOfficeId = await freeOfficeId(db);
  const office = await db.dsOffice.findUniqueOrThrow({ where: { id: dsOfficeId } });
  officeCode = office.code;
  districtId = office.districtId;
  await db.user.create({
    data: {
      id: "confirm-test-ds",
      name: "ත. පරීක්ෂණ",
      email: "confirm-test-ds@no-email.invalid",
      role: "DS_OFFICER",
      dsOfficeId,
    },
  });
  ds = { userId: "confirm-test-ds", role: "DS_OFFICER", dsOfficeId };
  await db.user.create({
    data: {
      id: "confirm-test-ho",
      name: "ප්‍ර. තහවුරු",
      email: "confirm-test-ho@no-email.invalid",
      role: "HO_OFFICER",
    },
  });
  ho = { userId: "confirm-test-ho", role: "HO_OFFICER", dsOfficeId: null };
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Head Office confirms a case from the sheet (IMP-5)", () => {
  it("approves it: it gets its case number and waits for its release from today, and the office isn't told", async () => {
    const c = await imported();
    expect(await confirm(ho, c, { outcome: "verified" })).toEqual({ ok: true, status: "VERIFIED" });

    const saved = await load(c.id);
    expect(saved).toMatchObject({ status: "VERIFIED", version: 2 });
    expect(saved.caseNumber).toMatch(new RegExp(`^${officeCode}-${colomboYear(new Date())}-\\d{3,}$`));
    expect(saved.verifiedAt && colomboDay(saved.verifiedAt)).toBe(today());
    expect(await db.decision.findMany({ where: { caseId: c.id } })).toMatchObject([
      { type: "CONFIRM_IMPORT", reason: null, byId: ho.userId },
    ]);
    const audit = await db.auditLog.findMany({ where: { caseId: c.id } });
    expect(audit).toMatchObject([
      {
        actorId: ho.userId,
        action: "case_import_confirmed",
        before: { status: "IMPORTED" },
        after: { status: "VERIFIED", caseNumber: saved.caseNumber },
      },
    ]);
    expect(await db.notification.count({ where: { caseId: c.id } })).toBe(0);

    // It is in the release queue, and no longer waits to be confirmed (REL-1).
    let page = 1;
    let inQueue = false;
    for (;;) {
      const queue = await listQueue(db, ho, "release", page);
      if (queue.rows.some((row) => row.id === c.id)) inQueue = true;
      if (inQueue || queue.rows.length === 0) break;
      page += 1;
    }
    expect(inQueue).toBe(true);
    expect((await listImported(db, ho, { page: 1, districtId })).rows.some((row) => row.id === c.id)).toBe(false);
  });

  it("records a case in progress with its release and each installment, as the office's money then shows", async () => {
    const before = await officeMoney(db, ds);
    const c = await imported();
    const values = {
      outcome: "inProgress",
      releasedOn: daysAgo(200),
      referenceNumber: "HO/2025/31",
      note: "පැරණි ලිපිගොනුවෙන්",
      status1: "RELEASED",
      day1: daysAgo(180),
      status2: "RELEASED",
      day2: daysAgo(90),
      status3: "PROCESSING",
      day3: addDays(today(), 10),
    } as const;
    expect(await confirm(ho, c, values)).toEqual({ ok: true, status: "IN_PROGRESS" });

    const saved = await load(c.id);
    // The sheet has no verification date.
    expect(saved).toMatchObject({ status: "IN_PROGRESS", verifiedAt: null });
    const release = await db.release.findUniqueOrThrow({ where: { caseId: c.id } });
    expect(release).toMatchObject({ amount: 2_000_000, referenceNumber: "HO/2025/31", byId: ho.userId });
    expect(dateToDay(release.releasedOn)).toBe(values.releasedOn);
    const installments = await db.installment.findMany({ where: { caseId: c.id }, orderBy: { number: "asc" } });
    expect(
      installments.map((i) => ({
        number: i.number,
        amount: i.amount,
        status: i.status,
        expectedOn: i.expectedOn && dateToDay(i.expectedOn),
        releasedOn: i.releasedOn && dateToDay(i.releasedOn),
      })),
    ).toEqual([
      { number: 1, amount: 500_000, status: "RELEASED", expectedOn: null, releasedOn: values.day1 },
      { number: 2, amount: 500_000, status: "RELEASED", expectedOn: null, releasedOn: values.day2 },
      { number: 3, amount: 500_000, status: "PROCESSING", expectedOn: values.day3, releasedOn: null },
      { number: 4, amount: 500_000, status: "NOT_STARTED", expectedOn: null, releasedOn: null },
    ]);
    const [audit] = await db.auditLog.findMany({ where: { caseId: c.id } });
    expect(audit?.after).toMatchObject({
      status: "IN_PROGRESS",
      release: { amount: 2_000_000, releasedOn: values.releasedOn, referenceNumber: "HO/2025/31" },
      installments: [
        { status: "RELEASED" },
        { status: "RELEASED" },
        { status: "PROCESSING" },
        { status: "NOT_STARTED" },
      ],
    });

    // HOME-4: the release and the two installments paid now count; until now they didn't (IMP-5).
    expect(await officeMoney(db, ds)).toEqual({
      received: (before?.received ?? 0) + 2_000_000,
      paidOut: (before?.paidOut ?? 0) + 1_000_000,
      balance: (before?.balance ?? 0) + 1_000_000,
    });

    // The office goes on from there as with any case (INS-4).
    const paid = await markInstallmentPaid(db, ds, {
      caseId: c.id,
      version: saved.version,
      number: 3,
      form: { releasedOn: today(), note: "" },
    });
    expect(paid).toMatchObject({ ok: true });
  });

  it("completes a case whose last installment is paid when its kind has no active stages (CLS-1)", async () => {
    // Other test files may leave renovation stages behind; set them aside for this test, then put them back.
    const active = await db.stageDefinition.findMany({
      where: { kind: "RENOVATION", active: true },
      select: { id: true },
    });
    await db.stageDefinition.updateMany({ where: { id: { in: active.map((s) => s.id) } }, data: { active: false } });
    try {
      const paidAll = Object.fromEntries(
        [1, 2, 3, 4].flatMap((n) => [
          [`status${n}`, "RELEASED"],
          [`day${n}`, daysAgo(50 - n)],
        ]),
      );
      const values = { outcome: "inProgress", releasedOn: daysAgo(60), referenceNumber: "HO/1", ...paidAll };
      const renovation = await imported({ kind: "RENOVATION" });
      expect(await confirm(ho, renovation, values)).toEqual({ ok: true, status: "COMPLETED" });
      expect(await load(renovation.id)).toMatchObject({ status: "COMPLETED" });
      expect(await db.notification.count({ where: { caseId: renovation.id, type: "COMPLETED" } })).toBe(1);

      // A new house also needs its last stage, which the office records.
      const house = await imported();
      expect(await confirm(ho, house, values)).toEqual({ ok: true, status: "IN_PROGRESS" });
    } finally {
      await db.stageDefinition.updateMany({ where: { id: { in: active.map((s) => s.id) } }, data: { active: true } });
    }
  });

  it("rejects or stops it with a reason, which its page shows; a stopped one reopens as approved (CLS-3)", async () => {
    const rejected = await imported({ kind: null });
    expect(await confirm(ho, rejected, { outcome: "rejected", reason: "  " })).toEqual({
      ok: false,
      error: null,
      errors: { reason: "reasonRequired" },
    });
    // No kind is needed to reject.
    expect(await confirm(ho, rejected, { outcome: "rejected", reason: "වෙනත් ආධාරයක් ලැබී ඇත" })).toEqual({
      ok: true,
      status: "REJECTED",
    });
    expect(await getCase(db, ds, rejected.id)).toMatchObject({
      status: "REJECTED",
      rejectReason: "වෙනත් ආධාරයක් ලැබී ඇත",
    });
    expect((await load(rejected.id)).caseNumber).not.toBeNull();

    const stopped = await imported();
    expect(await confirm(ho, stopped, { outcome: "stopped", reason: "ඉඩම් ගැටලුවක් නිසා" })).toEqual({
      ok: true,
      status: "STOPPED",
    });
    const details = await getCase(db, ho, stopped.id);
    expect(details).toMatchObject({ status: "STOPPED", release: null });
    expect(details?.stop).toMatchObject({ reason: "ඉඩම් ගැටලුවක් නිසා", statusBefore: null });
    expect(await reopenCase(db, ho, { caseId: stopped.id, version: details!.version, reason: "ඉඩම ලැබුණා" })).toEqual({
      ok: true,
      value: "VERIFIED",
    });
  });

  it("refuses anyone but Head Office, a case already confirmed, a missing kind and a stale form, writing nothing", async () => {
    const c = await imported({ kind: null });
    expect(await confirm(ds, c, { outcome: "rejected", reason: "හේතුවක් මෙන්න" })).toMatchObject({
      error: "roleNotAllowed",
    });
    expect(
      await confirmImported(
        db,
        { userId: "x", role: "ADMIN", dsOfficeId: null },
        { caseId: c.id, version: 1, form: form({}) },
      ),
    ).toMatchObject({ error: "notFound" });
    // Approving it, or recording its progress, waits for the office to fill in the kind of help.
    expect(await confirm(ho, c, { outcome: "verified" })).toMatchObject({ error: "kindMissing" });
    expect(
      await confirm(ho, c, { outcome: "inProgress", releasedOn: daysAgo(5), referenceNumber: "HO/2" }),
    ).toMatchObject({ error: "kindMissing" });
    expect(await confirm(ho, c, { outcome: "inProgress" })).toMatchObject({
      error: null,
      errors: { releasedOn: "dateRequired", referenceNumber: "referenceRequired" },
    });
    // A form opened before the office's change (CASE-10).
    await db.case.update({ where: { id: c.id }, data: { kind: "NEW_HOUSE", version: 2 } });
    expect(await confirm(ho, { id: c.id, version: 1 }, { outcome: "verified" })).toMatchObject({ error: "conflict" });
    expect(await load(c.id)).toMatchObject({ status: "IMPORTED", caseNumber: null });
    expect(await db.decision.count({ where: { caseId: c.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { caseId: c.id } })).toBe(0);

    expect(await confirm(ho, { id: c.id, version: 2 }, { outcome: "verified" })).toMatchObject({ ok: true });
    // Only once (STS-1).
    expect(await confirm(ho, { id: c.id, version: 3 }, { outcome: "rejected", reason: "හේතුවක් මෙන්න" })).toMatchObject(
      {
        error: "notAllowedNow",
      },
    );
  });
});

describe("after the confirmation (IMP-4, CASE-9)", () => {
  it("lets the office fill in a NIC or phone the case still lacks, and nothing else", async () => {
    const c = await imported({ mobile1: "0712345678" });
    await confirm(ho, c, { outcome: "verified" });
    const confirmed = await load(c.id);
    const missing = () => countCases(db, ds, { detailsMissing: true });
    const before = await missing();
    expect(before).toBeGreaterThan(0);

    const fill = (values: Partial<CaseValues>, version = confirmed.version) =>
      fillImported(db, ds, {
        id: c.id,
        version,
        values: { kind: "NEW_HOUSE", nic: null, mobile1: "0712345678", mobile2: null, ...values },
      });
    // The kind is as confirmed, and a phone number already there is Head Office's to change.
    expect(await fill({ kind: "RENOVATION" })).toEqual({ ok: false, error: "notEditable" });
    expect(await fill({ mobile1: "0771234567" })).toEqual({ ok: false, error: "notEditable" });
    expect(await fill({ nic: "198800012345" })).toEqual({ ok: true });
    expect(await load(c.id)).toMatchObject({ nic: "198800012345", nicKey: "198800012345", status: "VERIFIED" });
    expect(await missing()).toBe(before - 1);
    // Nothing is missing now, so there is nothing left to fill in.
    expect(await fill({ nic: "198800012345", mobile2: "0771234567" }, confirmed.version + 1)).toEqual({
      ok: false,
      error: "notEditable",
    });
  });

  it("lets Head Office keep what the sheet left empty, but not empty what is filled in", async () => {
    const c = await imported({ category: "CHILD_AT_RISK", childName: null, nic: null, mobile1: null });
    await confirm(ho, c, { outcome: "verified" });
    const values: CaseValues = {
      category: "CHILD_AT_RISK",
      kind: "NEW_HOUSE",
      childName: null,
      name: "තහවුරු පරීක්ෂණ",
      nic: null,
      address: "නො. 3, නව පාර",
      gnDivision: null,
      mobile1: null,
      mobile2: null,
      remark: null,
    };
    const save = async (changes: Partial<CaseValues>) =>
      saveCase(db, ho, {
        id: c.id,
        version: (await load(c.id)).version,
        dsOfficeId: null,
        values: { ...values, ...changes },
        documentIds: [],
        submit: false,
      });
    expect(await save({})).toMatchObject({ ok: true });
    expect(await load(c.id)).toMatchObject({ address: "නො. 3, නව පාර" });
    expect(await save({ name: null })).toEqual({ ok: false, error: "incomplete" });

    // A case entered in the system still keeps every required field (CASE-9).
    await db.case.update({ where: { id: c.id }, data: { sheetKey: null, sheetRow: null } });
    expect(await save({})).toEqual({ ok: false, error: "incomplete" });
  });
});

describe("the list of cases to confirm (IMP-5)", () => {
  it("follows the sheet's order, can be narrowed to a district, and counts what waits", async () => {
    const children = await imported({ category: "CHILD_AT_RISK", sheetRow: 3, childName: "දරුවා" });
    const late = await imported({ sheetRow: 900, kind: null });
    const early = await imported({ sheetRow: 2 });
    const mine = [early.id, late.id, children.id];

    const list = await listImported(db, ho, { page: 1, districtId });
    const order = list.rows.map((row) => row.id).filter((id) => mine.includes(id));
    // The care leavers' tab first, then the children's, each by its row.
    expect(order).toEqual([early.id, late.id, children.id]);
    expect(list.rows.find((row) => row.id === late.id)).toMatchObject({ kindMissing: true, sheetRow: 900 });

    const other = await db.district.findFirstOrThrow({ where: { id: { not: districtId } } });
    const elsewhere = await listImported(db, ho, { page: 1, districtId: other.id });
    expect(elsewhere.rows.some((row) => mine.includes(row.id))).toBe(false);

    const total = await importedCount(db, ho);
    expect(total).toBeGreaterThanOrEqual(3);
    const districts = await importedByDistrict(db, ho);
    expect(districts.reduce((sum, d) => sum + d.count, 0)).toBe(total);
    expect(districts.find((d) => d.id === districtId)?.count).toBeGreaterThanOrEqual(3);

    // Only Head Office confirms.
    expect(await listImported(db, ds, { page: 1 })).toEqual({ rows: [], total: 0 });
    expect(await importedCount(db, ds)).toBe(0);
    expect(await importedByDistrict(db, ds)).toEqual([]);
  });
});
