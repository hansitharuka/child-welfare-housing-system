import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../../prisma/seed-data";
import { createTestClient, freeOfficeId } from "../../../tests/db/client";
import { colomboDay, dayToDate } from "@/lib/dates";
import type { CaseValues } from "@/lib/validation/case";
import type { ReleaseField } from "@/lib/validation/release";
import { listNotifications, unreadCount, unreadNow } from "../notifications/queries";
import { openNotification } from "../notifications/commands";
import { correctRelease, recordRelease } from "../releases/commands";
import { type Actor, saveCase, type SaveCaseInput } from "./commands";
import { decideCase } from "./decide";
import { getCase, todoItems } from "./queries";
import { listQueue, queueCounts, waitingNow } from "./queues";

const db = createTestClient();

let dsA: Actor;
let dsB: Actor;
let ho: Actor;
const admin: Actor = { userId: "review-test-admin", role: "ADMIN", dsOfficeId: null };

/** A complete, made-up case (SEC-11). Each test gives its own NIC so tests don't match each other. */
const values = (nic: string, overrides: Partial<CaseValues> = {}): CaseValues => ({
  category: "CARE_LEAVER",
  kind: "NEW_HOUSE",
  childName: null,
  name: "පරීක්ෂණ ප්‍රතිලාභී",
  nic,
  address: "නො. 1, පරීක්ෂණ පාර",
  gnDivision: null,
  mobile1: "0710000001",
  mobile2: null,
  remark: null,
  ...overrides,
});

const input = (nic: string, overrides: Partial<SaveCaseInput> = {}): SaveCaseInput => ({
  id: randomUUID(),
  version: null,
  dsOfficeId: null,
  values: values(nic),
  documentIds: [],
  submit: false,
  ...overrides,
});

const load = (id: string) => db.case.findUniqueOrThrow({ where: { id } });

/** A case the office has sent to Head Office. */
async function submitted(nic: string, actor = dsA) {
  const result = await saveCase(db, actor, input(nic, { submit: true }));
  if (!result.ok) throw new Error(result.error);
  return load(result.value.id);
}

async function verified(nic: string) {
  const sent = await submitted(nic);
  const result = await decideCase(db, ho, { caseId: sent.id, version: sent.version, decision: "verify", reason: null });
  if (!result.ok) throw new Error(result.error);
  return load(sent.id);
}

const today = () => colomboDay(new Date());
const releaseForm = (overrides: Partial<Record<ReleaseField, string>> = {}): Record<ReleaseField, string> => ({
  releasedOn: today(),
  referenceNumber: "HO/2026/0141",
  note: "",
  ...overrides,
});

async function released(nic: string) {
  const ready = await verified(nic);
  const result = await recordRelease(db, ho, { caseId: ready.id, version: ready.version, form: releaseForm() });
  if (!result.ok) throw new Error(String(result.error ?? JSON.stringify(result.errors)));
  return load(ready.id);
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
  dsA = await officer("review-test-ds-a");
  dsB = await officer("review-test-ds-b");
  await db.user.create({
    data: { id: "review-test-ho", name: "ප්‍ර. පරීක්ෂණ", email: "review-test-ho@no-email.invalid", role: "HO_OFFICER" },
  });
  ho = { userId: "review-test-ho", role: "HO_OFFICER", dsOfficeId: null };
  await db.user.create({
    data: { id: admin.userId, name: "පරිපාලක", email: "review-test-admin@no-email.invalid", role: "ADMIN" },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("checking a case (CHK-3)", () => {
  it("verifies it, records the decision and tells the office's officer", async () => {
    const sent = await submitted("200200000001");
    const result = await decideCase(db, ho, {
      caseId: sent.id,
      version: sent.version,
      decision: "verify",
      reason: null,
    });

    expect(result).toEqual({ ok: true, value: "VERIFIED" });
    const after = await load(sent.id);
    expect(after.status).toBe("VERIFIED");
    expect(after.verifiedAt).not.toBeNull();
    expect(await db.decision.count({ where: { caseId: sent.id, type: "VERIFY", byId: ho.userId } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { caseId: sent.id, action: "case_verified" } });
    expect(audit).toMatchObject({ actorId: ho.userId, before: { status: "SUBMITTED" }, after: { status: "VERIFIED" } });
    const notices = await db.notification.findMany({ where: { caseId: sent.id } });
    expect(notices.map((n) => [n.userId, n.type])).toEqual([[dsA.userId, "VERIFIED"]]);
  });

  it("needs a reason of 5 to 1,000 characters to send back or reject, and shows it to the office (AC-9)", async () => {
    const sent = await submitted("200200000002");
    const decide = (decision: "sendBack" | "reject", reason: string | null) =>
      decideCase(db, ho, { caseId: sent.id, version: sent.version, decision, reason });

    expect(await decide("sendBack", null)).toEqual({ ok: false, error: "reasonRequired" });
    expect(await decide("sendBack", "  ")).toEqual({ ok: false, error: "reasonRequired" });
    expect(await decide("reject", "නැත")).toEqual({ ok: false, error: "reasonTooShort" });
    expect(await decide("reject", "x".repeat(1001))).toEqual({ ok: false, error: "reasonTooLong" });
    expect((await load(sent.id)).status).toBe("SUBMITTED");

    expect(await decide("sendBack", " ලිපිනය සම්පූර්ණ නැත. ")).toEqual({ ok: true, value: "RETURNED" });
    expect((await getCase(db, dsA, sent.id))?.returnReason).toBe("ලිපිනය සම්පූර්ණ නැත.");
    const todo = await todoItems(db, dsA);
    expect(todo.find((item) => item.id === sent.id)).toMatchObject({
      type: "returned",
      reason: "ලිපිනය සම්පූර්ණ නැත.",
    });
    expect(await db.notification.count({ where: { caseId: sent.id, userId: dsA.userId, type: "SENT_BACK" } })).toBe(1);
  });

  it("puts a resubmitted case back in the queue, with its number, behind older ones (AC-8, AC-9)", async () => {
    const first = await submitted("200200000003");
    const second = await submitted("200200000004");
    await decideCase(db, ho, {
      caseId: first.id,
      version: first.version,
      decision: "sendBack",
      reason: "ඡායාරූප නැත.",
    });
    const returned = await load(first.id);

    const again = await saveCase(db, dsA, {
      ...input("200200000003"),
      id: first.id,
      version: returned.version,
      submit: true,
    });
    expect(again).toMatchObject({ ok: true, value: { status: "SUBMITTED", caseNumber: first.caseNumber } });

    const queue = (await listQueue(db, ho, "check", 1)).rows.map((row) => row.id);
    expect(queue.indexOf(second.id)).toBeGreaterThanOrEqual(0);
    expect(queue.indexOf(first.id)).toBeGreaterThan(queue.indexOf(second.id));
  });

  it("rejects for good (STS-2)", async () => {
    const sent = await submitted("200200000005");
    await decideCase(db, ho, {
      caseId: sent.id,
      version: sent.version,
      decision: "reject",
      reason: "වෙනත් ආධාර ලැබී ඇත.",
    });
    const rejected = await load(sent.id);

    expect(rejected.status).toBe("REJECTED");
    expect((await getCase(db, dsA, sent.id))?.rejectReason).toBe("වෙනත් ආධාර ලැබී ඇත.");
    expect(await db.notification.count({ where: { caseId: sent.id, userId: dsA.userId, type: "REJECTED" } })).toBe(1);
    expect(
      await decideCase(db, ho, { caseId: sent.id, version: rejected.version, decision: "verify", reason: null }),
    ).toEqual({ ok: false, error: "notAllowedNow" });
    expect(
      await saveCase(db, dsA, { ...input("200200000005"), id: sent.id, version: rejected.version, submit: true }),
    ).toEqual({ ok: false, error: "notEditable" });
  });

  it("lets only Head Office decide, and only a submitted case (STS-1, SEC-2)", async () => {
    const sent = await submitted("200200000006");
    const verify = (actor: Actor, caseId = sent.id, version = sent.version) =>
      decideCase(db, actor, { caseId, version, decision: "verify", reason: null });

    expect(await verify(dsA)).toEqual({ ok: false, error: "roleNotAllowed" });
    expect(await verify(dsB)).toEqual({ ok: false, error: "notFound" });
    expect(await verify(admin)).toEqual({ ok: false, error: "notFound" });
    expect(await verify(ho, randomUUID())).toEqual({ ok: false, error: "notFound" });

    const draft = await saveCase(db, dsA, input("200200000007"));
    if (!draft.ok) throw new Error(draft.error);
    expect(await verify(ho, draft.value.id, 1)).toEqual({ ok: false, error: "notAllowedNow" });
    expect(await db.decision.count({ where: { caseId: sent.id, type: "VERIFY" } })).toBe(0);
  });

  it("doesn't decide on details nobody has seen: the case came back changed (CASE-10)", async () => {
    const sent = await submitted("200200000008");
    await decideCase(db, ho, {
      caseId: sent.id,
      version: sent.version,
      decision: "sendBack",
      reason: "ලිපිනය වැරදියි.",
    });
    const returned = await load(sent.id);
    await saveCase(db, dsA, {
      ...input("200200000008"),
      id: sent.id,
      version: returned.version,
      values: values("200200000008", { address: "නො. 2, නිවැරදි පාර" }),
      submit: true,
    });

    // The check view was opened before it was sent back: its version is old.
    const stale = await decideCase(db, ho, {
      caseId: sent.id,
      version: sent.version,
      decision: "verify",
      reason: null,
    });
    expect(stale).toEqual({ ok: false, error: "conflict" });
  });

  it("lets only one of two officers verifying at the same moment succeed", async () => {
    const sent = await submitted("200200000009");
    const results = await Promise.all(
      [1, 2].map(() =>
        decideCase(db, ho, { caseId: sent.id, version: sent.version, decision: "verify", reason: null }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.decision.count({ where: { caseId: sent.id, type: "VERIFY" } })).toBe(1);
    expect(await db.notification.count({ where: { caseId: sent.id } })).toBe(1);
  });

  it("tells only active officers", async () => {
    const office = dsA.dsOfficeId as number;
    await db.user.create({
      data: {
        id: "review-test-ds-old",
        name: "පැරණි නිලධාරී",
        email: "review-test-ds-old@no-email.invalid",
        role: "DS_OFFICER",
        dsOfficeId: office,
        banned: true,
      },
    });
    const sent = await submitted("200200000010");
    await decideCase(db, ho, { caseId: sent.id, version: sent.version, decision: "verify", reason: null });
    const told = await db.notification.findMany({ where: { caseId: sent.id }, select: { userId: true } });
    expect(told).toEqual([{ userId: dsA.userId }]);
  });
});

describe("the queues (CHK-1, REL-1)", () => {
  it("lists submitted cases oldest first, flagging a NIC that another case has", async () => {
    const older = await submitted("200200000020");
    const twin = await submitted("200200000021");
    await saveCase(db, dsB, input("200200000021", { submit: true }));
    const { rows } = await listQueue(db, ho, "check", 1);

    const ids = rows.map((row) => row.id);
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(twin.id));
    const since = rows.map((row) => row.waitingSince?.getTime() ?? 0);
    expect(since).toEqual([...since].sort((a, b) => a - b));
    expect(rows.find((row) => row.id === older.id)?.duplicate).toBe(false);
    expect(rows.find((row) => row.id === twin.id)?.duplicate).toBe(true);
  });

  it("lists verified cases oldest verification first", async () => {
    const first = await verified("200200000022");
    const second = await verified("200200000023");
    const ids = (await listQueue(db, ho, "release", 1)).rows.map((row) => row.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  it("counts both queues for Head Office only", async () => {
    const before = Date.now();
    const counts = await queueCounts(db, ho);
    expect(counts.check).toBe(await db.case.count({ where: { status: "SUBMITTED" } }));
    expect(counts.release).toBe(await db.case.count({ where: { status: "VERIFIED" } }));
    // The menu's reading: both together, and when they were read (NTF-1).
    const menu = await waitingNow(db, ho);
    expect(menu.count).toBe(counts.check + counts.release);
    expect(menu.at).toBeGreaterThanOrEqual(before);
    for (const actor of [dsA, admin]) {
      expect(await queueCounts(db, actor)).toEqual({ check: 0, release: 0 });
      expect((await waitingNow(db, actor)).count).toBe(0);
      expect(await listQueue(db, actor, "check", 1)).toEqual({ rows: [], total: 0 });
    }
  });
});

describe("the Rs. 2,000,000 release (REL-2, REL-3, AC-10)", () => {
  it("moves the case on, makes four NOT_STARTED installments of Rs. 500,000 and tells the office", async () => {
    const ready = await verified("200200000030");
    const result = await recordRelease(db, ho, {
      caseId: ready.id,
      version: ready.version,
      form: releaseForm({ referenceNumber: " HO/2026/0142 ", note: "පළමු කොටස" }),
    });

    expect(result).toEqual({ ok: true });
    expect((await load(ready.id)).status).toBe("IN_PROGRESS");
    const release = await db.release.findUniqueOrThrow({ where: { caseId: ready.id } });
    expect(release).toMatchObject({ amount: 2_000_000, referenceNumber: "HO/2026/0142", note: "පළමු කොටස" });
    expect(release.releasedOn).toEqual(dayToDate(today()));
    const installments = await db.installment.findMany({ where: { caseId: ready.id }, orderBy: { number: "asc" } });
    expect(installments.map((i) => [i.number, i.amount, i.status])).toEqual([
      [1, 500_000, "NOT_STARTED"],
      [2, 500_000, "NOT_STARTED"],
      [3, 500_000, "NOT_STARTED"],
      [4, 500_000, "NOT_STARTED"],
    ]);
    expect(await db.notification.count({ where: { caseId: ready.id, userId: dsA.userId, type: "RELEASED" } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { caseId: ready.id, action: "case_released" } });
    expect(audit.after).toMatchObject({ status: "IN_PROGRESS", amount: 2_000_000, referenceNumber: "HO/2026/0142" });

    const details = await getCase(db, dsA, ready.id);
    expect(details?.release).toMatchObject({ releasedOn: today(), amount: 2_000_000 });
    expect(details?.installments).toHaveLength(4);
  });

  it("refuses a missing reference number, a future date and a date before the verification", async () => {
    const ready = await verified("200200000031");
    const refused = async (form: Record<ReleaseField, string>) => {
      const result = await recordRelease(db, ho, { caseId: ready.id, version: ready.version, form });
      return result.ok ? null : result.errors;
    };
    const tomorrow = colomboDay(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const dayBefore = colomboDay(new Date((ready.verifiedAt as Date).getTime() - 24 * 60 * 60 * 1000));

    expect(await refused(releaseForm({ referenceNumber: "" }))).toEqual({ referenceNumber: "referenceRequired" });
    expect(await refused(releaseForm({ releasedOn: tomorrow }))).toEqual({ releasedOn: "dateInFuture" });
    expect(await refused(releaseForm({ releasedOn: dayBefore }))).toEqual({ releasedOn: "dateBeforeVerified" });
    expect(await refused(releaseForm({ releasedOn: "2026-02-30" }))).toEqual({ releasedOn: "dateInvalid" });
    expect((await load(ready.id)).status).toBe("VERIFIED");
    expect(await db.installment.count({ where: { caseId: ready.id } })).toBe(0);
  });

  it("refuses a case that isn't verified, a second release, a DS officer and an old form", async () => {
    const sent = await submitted("200200000032");
    const release = (actor: Actor, caseId: string, version: number) =>
      recordRelease(db, actor, { caseId, version, form: releaseForm() });

    expect(await release(ho, sent.id, sent.version)).toEqual({ ok: false, error: "notAllowedNow", errors: {} });
    const ready = await verified("200200000033");
    expect(await release(dsA, ready.id, ready.version)).toEqual({ ok: false, error: "roleNotAllowed", errors: {} });
    expect(await release(admin, ready.id, ready.version)).toEqual({ ok: false, error: "notFound", errors: {} });
    expect(await release(ho, ready.id, ready.version - 1)).toEqual({ ok: false, error: "conflict", errors: {} });

    expect(await release(ho, ready.id, ready.version)).toEqual({ ok: true });
    expect(await release(ho, ready.id, ready.version)).toEqual({ ok: false, error: "notAllowedNow", errors: {} });
    expect(await db.release.count({ where: { caseId: ready.id } })).toBe(1);
    expect(await db.installment.count({ where: { caseId: ready.id } })).toBe(4);
  });

  it("can't hold any other amount, even when written directly to the database", async () => {
    const ready = await verified("200200000034");
    await expect(
      db.release.create({
        data: {
          id: randomUUID(),
          caseId: ready.id,
          releasedOn: dayToDate(today()),
          amount: 1_500_000,
          referenceNumber: "X",
          byId: ho.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.installment.create({ data: { id: randomUUID(), caseId: ready.id, number: 5, amount: 500_000 } }),
    ).rejects.toThrow();
  });
});

describe("correcting a release (REL-4)", () => {
  it("changes the date, reference and note, and logs the old and new value of each", async () => {
    const running = await released("200200000040");
    const result = await correctRelease(db, ho, {
      caseId: running.id,
      version: running.version,
      form: releaseForm({ referenceNumber: "HO/2026/0200", note: "නිවැරදි කළා" }),
    });

    expect(result).toEqual({ ok: true });
    expect(await db.release.findUniqueOrThrow({ where: { caseId: running.id } })).toMatchObject({
      referenceNumber: "HO/2026/0200",
      note: "නිවැරදි කළා",
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { caseId: running.id, action: "release_corrected" } });
    expect(audit).toMatchObject({
      actorId: ho.userId,
      before: { referenceNumber: "HO/2026/0141", note: null },
      after: { referenceNumber: "HO/2026/0200", note: "නිවැරදි කළා" },
    });
    expect((await load(running.id)).version).toBe(running.version + 1);
  });

  it("can't move the date past an installment already recorded, and only Head Office corrects", async () => {
    const running = await released("200200000041");
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => colomboDay(new Date(Date.now() - n * DAY));
    // Verified 10 days ago, with the first installment expected 5 days ago (Phase 6 records those).
    await db.case.update({ where: { id: running.id }, data: { verifiedAt: new Date(Date.now() - 10 * DAY) } });
    await db.installment.updateMany({
      where: { caseId: running.id, number: 1 },
      data: { status: "PROCESSING", expectedOn: dayToDate(daysAgo(5)) },
    });
    const correct = (actor: Actor, releasedOn: string) =>
      correctRelease(db, actor, { caseId: running.id, version: running.version, form: releaseForm({ releasedOn }) });

    expect(await correct(dsA, daysAgo(6))).toEqual({ ok: false, error: "roleNotAllowed", errors: {} });
    expect(await correct(ho, daysAgo(3))).toEqual({
      ok: false,
      error: null,
      errors: { releasedOn: "dateAfterInstallment" },
    });
    expect(await correct(ho, daysAgo(11))).toEqual({
      ok: false,
      error: null,
      errors: { releasedOn: "dateBeforeVerified" },
    });
    expect(await correct(ho, daysAgo(6))).toEqual({ ok: true });
    expect((await db.release.findUniqueOrThrow({ where: { caseId: running.id } })).releasedOn).toEqual(
      dayToDate(daysAgo(6)),
    );

    const notYet = await verified("200200000042");
    expect(await correctRelease(db, ho, { caseId: notYet.id, version: notYet.version, form: releaseForm() })).toEqual({
      ok: false,
      error: "noRelease",
      errors: {},
    });
  });
});

describe("changing a verified case (CASE-9)", () => {
  it("lets Head Office change it, logging the old and new value of each field", async () => {
    const ready = await verified("200200000050");
    const result = await saveCase(db, ho, {
      ...input("200200000050"),
      id: ready.id,
      version: ready.version,
      values: values("200200000050", { mobile1: "0770000050" }),
    });

    expect(result).toMatchObject({ ok: true, value: { status: "VERIFIED" } });
    expect((await load(ready.id)).mobile1).toBe("0770000050");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { caseId: ready.id, action: "case_updated" },
      orderBy: { id: "desc" },
    });
    expect(audit).toMatchObject({
      actorId: ho.userId,
      before: { mobile1: "0710000001" },
      after: { mobile1: "0770000050", documentsAdded: [] },
    });
  });

  it("refuses the DS office, an empty required field and a submit", async () => {
    const running = await released("200200000051");
    const change = (actor: Actor, overrides: Partial<SaveCaseInput>) =>
      saveCase(db, actor, { ...input("200200000051"), id: running.id, version: running.version, ...overrides });

    expect(await change(dsA, {})).toEqual({ ok: false, error: "notEditable" });
    expect(await change(ho, { values: values("200200000051", { name: null }) })).toEqual({
      ok: false,
      error: "incomplete",
    });
    expect(await change(ho, { submit: true })).toEqual({ ok: false, error: "notAllowedNow" });
    expect((await load(running.id)).status).toBe("IN_PROGRESS");
  });
});

describe("notifications (NTF-1)", () => {
  it("shows the office's officer their notices, newest first, and opening one marks it read", async () => {
    const ready = await verified("200200000060");
    await recordRelease(db, ho, { caseId: ready.id, version: ready.version, form: releaseForm() });

    const mine = (await listNotifications(db, dsA)).filter((n) => n.caseId === ready.id);
    expect(mine.map((n) => [n.type, n.read])).toEqual([
      ["RELEASED", false],
      ["VERIFIED", false],
    ]);
    const before = await unreadCount(db, dsA);
    expect((await unreadNow(db, dsA)).count).toBe(before);
    expect(await openNotification(db, dsA, mine[0]!.id)).toEqual({ caseId: ready.id });
    expect(await unreadCount(db, dsA)).toBe(before - 1);
    // Opening it again changes nothing.
    expect(await openNotification(db, dsA, mine[0]!.id)).toEqual({ caseId: ready.id });
    expect(await unreadCount(db, dsA)).toBe(before - 1);
  });

  it("keeps them from everyone else, and from the officer once moved to another office (PRM-3)", async () => {
    const ready = await verified("200200000061");
    const notice = await db.notification.findFirstOrThrow({ where: { caseId: ready.id, userId: dsA.userId } });

    expect(await openNotification(db, dsB, notice.id)).toBeNull();
    expect(await openNotification(db, ho, notice.id)).toBeNull();
    const moved: Actor = { ...dsA, dsOfficeId: dsB.dsOfficeId };
    expect((await listNotifications(db, moved)).some((n) => n.id === notice.id)).toBe(false);
    expect(await openNotification(db, moved, notice.id)).toBeNull();
    expect(await listNotifications(db, admin)).toEqual([]);
  });
});
