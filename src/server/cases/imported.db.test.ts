import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../../prisma/seed-data";
import { createTestClient, freeOfficeId } from "../../../tests/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { ImportedValues } from "@/lib/validation/case";
import type { SheetNotes } from "../import/commands";
import type { Actor } from "./commands";
import { fillImported } from "./imported";
import { countCases, getCase, listCases } from "./queries";

const db = createTestClient();
const KEY = "imported-test:";

let dsA: Actor;
let dsB: Actor;
let ho: Actor;
const admin: Actor = { userId: "imported-test-admin", role: "ADMIN", dsOfficeId: null };

const FILLED: ImportedValues = { kind: "NEW_HOUSE", nic: "880001234V", mobile1: "0712345678", mobile2: null };

/** A made-up case as the import leaves it (SEC-11): no kind, and here no NIC or phone number either. */
async function importedCase(actor: Actor, fields: Partial<Prisma.CaseUncheckedCreateInput> = {}) {
  const id = randomUUID();
  return db.case.create({
    data: {
      id,
      dsOfficeId: actor.dsOfficeId as number,
      category: "CARE_LEAVER",
      status: "IMPORTED",
      name: "පැරණි පත්‍රිකා පරීක්ෂණ",
      address: "නො. 1, පරීක්ෂණ පාර",
      createdById: ho.userId,
      sheetKey: `${KEY}${id}`,
      sheetRow: 3,
      ...fields,
    },
  });
}

async function officer(id: string): Promise<Actor> {
  const dsOfficeId = await freeOfficeId(db);
  await db.user.create({
    data: { id, name: "ප. පරීක්ෂණ", email: `${id}@no-email.invalid`, role: "DS_OFFICER", dsOfficeId },
  });
  return { userId: id, role: "DS_OFFICER", dsOfficeId };
}

beforeAll(async () => {
  await seed(db);
  dsA = await officer("imported-test-ds-a");
  dsB = await officer("imported-test-ds-b");
  await db.user.create({
    data: {
      id: "imported-test-ho",
      name: "ප්‍ර. පරීක්ෂණ",
      email: "imported-test-ho@no-email.invalid",
      role: "HO_OFFICER",
    },
  });
  ho = { userId: "imported-test-ho", role: "HO_OFFICER", dsOfficeId: null };
  await db.user.create({
    data: { id: admin.userId, name: "පරිපාලක", email: "imported-test-admin@no-email.invalid", role: "ADMIN" },
  });
});

afterAll(async () => {
  // The audit records stay (HIS-3); the cases go, so the other test files don't see them.
  await db.case.deleteMany({ where: { OR: [{ sheetKey: { startsWith: KEY } }, { name: "කෙටුම්පත් පරීක්ෂණ" }] } });
  await db.$disconnect();
});

describe("the office fills in a case from the sheet (IMP-5)", () => {
  it("saves the kind of help, NIC and phone numbers, and logs each change with its old value (HIS-1)", async () => {
    const found = await importedCase(dsA, { mobile1: "0112345678" });
    const result = await fillImported(db, dsA, { id: found.id, version: 1, values: FILLED });
    expect(result).toEqual({ ok: true });

    const saved = await db.case.findUniqueOrThrow({ where: { id: found.id } });
    expect(saved).toMatchObject({
      status: "IMPORTED",
      kind: "NEW_HOUSE",
      nic: "880001234V",
      // The duplicate check (CASE-6) finds it by its 12-digit form.
      nicKey: "198800001234",
      mobile1: "0712345678",
      mobile2: null,
      version: 2,
    });
    const audit = await db.auditLog.findMany({ where: { caseId: found.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: dsA.userId,
      action: "case_updated",
      before: { kind: null, nic: null, mobile1: "0112345678" },
      after: { kind: "NEW_HOUSE", nic: "880001234V", mobile1: "0712345678" },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const found = await importedCase(dsA, { ...FILLED });
    expect(await fillImported(db, dsA, { id: found.id, version: 1, values: FILLED })).toEqual({ ok: true });
    expect(await db.case.findUniqueOrThrow({ where: { id: found.id } })).toMatchObject({ version: 1 });
    expect(await db.auditLog.count({ where: { caseId: found.id } })).toBe(0);
  });

  it("is only for the case's own office, and after Head Office confirms the case only what it lacks", async () => {
    const found = await importedCase(dsA);
    const fill = (actor: Actor, version = 1) => fillImported(db, actor, { id: found.id, version, values: FILLED });

    // Another office, and an admin, don't learn that it exists (PRM-1).
    expect(await fill(dsB)).toEqual({ ok: false, error: "notFound" });
    expect(await fill(admin)).toEqual({ ok: false, error: "notFound" });
    expect(await fillImported(db, dsA, { id: randomUUID(), version: 1, values: FILLED })).toEqual({
      ok: false,
      error: "notFound",
    });
    // Head Office confirms the case instead (IMP-5).
    expect(await fill(ho)).toEqual({ ok: false, error: "roleNotAllowed" });
    // A form opened before someone else's save (CASE-10).
    expect(await fill(dsA, 0)).toEqual({ ok: false, error: "conflict" });

    // Once confirmed, the kind is Head Office's (fillableFields); confirm-import.db.test.ts fills a NIC.
    await db.case.update({ where: { id: found.id }, data: { status: "VERIFIED" } });
    expect(await fill(dsA)).toEqual({ ok: false, error: "notEditable" });
    expect(await db.case.findUniqueOrThrow({ where: { id: found.id } })).toMatchObject({ kind: null, version: 1 });
    expect(await db.auditLog.count({ where: { caseId: found.id } })).toBe(0);
  });

  it("shows the sheet's notes on the case, read-only", async () => {
    const notes: SheetNotes = {
      installments: ["ඔව්", null, null, null],
      levels: [null, null, null, null],
      remark: null,
      phone: "0771234567 0712345678 0112345678",
    };
    const found = await importedCase(dsA, { sheetNotes: notes });
    expect((await getCase(db, dsA, found.id))?.sheetNotes).toEqual(notes);
    expect((await getCase(db, dsA, (await importedCase(dsA)).id))?.sheetNotes).toBeNull();
  });
});

describe("the details missing filter (IMP-4)", () => {
  it("lists the office's cases from the sheet that lack the kind of help, the NIC or a phone number", async () => {
    // A fresh office, so the counts are this test's own.
    const ds = await officer("imported-test-ds-c");
    const lacking = [
      await importedCase(ds),
      await importedCase(ds, { ...FILLED, kind: null }),
      await importedCase(ds, { ...FILLED, nic: null }),
      await importedCase(ds, { ...FILLED, mobile1: null, mobile2: "0712345678" }),
    ];
    const complete = await importedCase(ds, { ...FILLED });
    // Confirmed: it stays while running with no NIC or first phone number, not once those are in.
    const confirmedLacking = await importedCase(ds, { ...FILLED, status: "IN_PROGRESS", nic: null });
    lacking.push(confirmedLacking);
    const confirmed = await importedCase(ds, { ...FILLED, status: "VERIFIED" });
    const closed = await importedCase(ds, { status: "REJECTED" });
    const draft = await db.case.create({
      data: {
        id: randomUUID(),
        dsOfficeId: ds.dsOfficeId as number,
        name: "කෙටුම්පත් පරීක්ෂණ",
        createdById: ds.userId,
      },
    });
    const elsewhere = await importedCase(dsB);

    const list = await listCases(db, ds, { detailsMissing: true });
    expect(new Set(list.rows.map((row) => row.id))).toEqual(new Set(lacking.map((c) => c.id)));
    expect(list.rows.every((row) => row.detailsMissing)).toBe(true);
    expect(await countCases(db, ds, { detailsMissing: true })).toBe(lacking.length);

    const all = await listCases(db, ds, {});
    const flag = (id: string) => all.rows.find((row) => row.id === id)?.detailsMissing;
    expect([flag(complete.id), flag(confirmed.id), flag(closed.id), flag(draft.id)]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(flag(confirmedLacking.id)).toBe(true);
    expect(all.rows.some((row) => row.id === elsewhere.id)).toBe(false);

    // Filling a case in takes it off the list.
    expect(await fillImported(db, ds, { id: lacking[0].id, version: 1, values: FILLED })).toEqual({ ok: true });
    expect(await countCases(db, ds, { detailsMissing: true })).toBe(lacking.length - 1);
    // Head Office sees the same cases with the same filter.
    expect(await countCases(db, ho, { detailsMissing: true, dsOfficeId: ds.dsOfficeId as number })).toBe(
      lacking.length - 1,
    );
  });
});
