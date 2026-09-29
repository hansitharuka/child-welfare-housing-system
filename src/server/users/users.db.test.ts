import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../../prisma/seed-data";
import { createTestClient } from "../../../tests/db/client";
import type { AccountInput } from "@/lib/validation/user";
import { createAccount, resetPassword, setAccountDisabled, updateAccount } from "./commands";
import { accountHistory, listAccounts } from "./queries";

const db = createTestClient();
const ADMIN = "users-test-admin";
let homagama: number;
let kaduwela: number;

const officer = (dsOfficeId: number): AccountInput => ({
  name: "ජී. පරීක්ෂණ",
  designation: "සංවර්ධන නිලධාරී",
  mobile: "0710000201",
  contactEmail: null,
  role: "DS_OFFICER",
  dsOfficeId,
});

const passwordOf = async (userId: string) =>
  (await db.account.findFirstOrThrow({ where: { userId, providerId: "credential" } })).password ?? "";

beforeAll(async () => {
  await seed(db);
  homagama = (await db.dsOffice.findUniqueOrThrow({ where: { code: "HMG" } })).id;
  kaduwela = (await db.dsOffice.findUniqueOrThrow({ where: { code: "KDW" } })).id;
  await db.user.create({
    data: { id: ADMIN, name: "පරිපාලක", email: "users-test-admin@no-email.invalid", username: "ad9000", role: "ADMIN" },
  });
});

afterAll(() => db.$disconnect());

describe("creating an account (ADM-2)", () => {
  it("makes the account, its temporary password and an audit record together", async () => {
    const result = await createAccount(db, ADMIN, officer(homagama));
    if (!result.ok) throw new Error(result.error);
    const { username, temporaryPassword } = result.value;

    expect(username).toMatch(/^ds\d{4}$/);
    const user = await db.user.findUniqueOrThrow({ where: { username } });
    expect(user).toMatchObject({ role: "DS_OFFICER", dsOfficeId: homagama, mustChangePassword: true, banned: false });
    expect(user.email).toBe(`${username}@no-email.invalid`);
    expect(await verifyPassword({ hash: await passwordOf(user.id), password: temporaryPassword })).toBe(true);

    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "account_created" } });
    expect(audit.actorId).toBe(ADMIN);
  });

  it("gives the next number to the next account", async () => {
    const first = await createAccount(db, ADMIN, officer(homagama));
    const second = await createAccount(db, ADMIN, officer(homagama));
    if (!first.ok || !second.ok) throw new Error("create failed");
    expect(Number(second.value.username.slice(2))).toBe(Number(first.value.username.slice(2)) + 1);
  });

  it("refuses an inactive office (LST-3)", async () => {
    await db.dsOffice.update({ where: { id: kaduwela }, data: { active: false } });
    expect(await createAccount(db, ADMIN, officer(kaduwela))).toEqual({ ok: false, error: "officeUnavailable" });
    await db.dsOffice.update({ where: { id: kaduwela }, data: { active: true } });
  });
});

describe("changing an account (ADM-4)", () => {
  it("moves an officer to another office and keeps both offices in the history", async () => {
    const created = await createAccount(db, ADMIN, officer(homagama));
    if (!created.ok) throw new Error(created.error);
    const user = await db.user.findUniqueOrThrow({ where: { username: created.value.username } });

    const result = await updateAccount(db, ADMIN, user.id, officer(kaduwela));
    expect(result).toEqual({ ok: true, value: { changed: ["dsOfficeId"] } });

    const [latest] = await accountHistory(db, user.id);
    expect(latest).toMatchObject({
      action: "account_updated",
      actorName: "පරිපාලක",
      before: { dsOfficeId: homagama },
      after: { dsOfficeId: kaduwela },
    });
  });

  it("records nothing when nothing changed", async () => {
    const created = await createAccount(db, ADMIN, officer(homagama));
    if (!created.ok) throw new Error(created.error);
    const user = await db.user.findUniqueOrThrow({ where: { username: created.value.username } });
    expect(await updateAccount(db, ADMIN, user.id, officer(homagama))).toEqual({ ok: true, value: { changed: [] } });
    expect(await accountHistory(db, user.id)).toHaveLength(1);
  });
});

describe("resetting a password (ADM-5)", () => {
  it("issues a new temporary password, clears a lock and ends the sessions", async () => {
    const created = await createAccount(db, ADMIN, officer(homagama));
    if (!created.ok) throw new Error(created.error);
    const user = await db.user.update({
      where: { username: created.value.username },
      data: { mustChangePassword: false, failedSignIns: 3, lockedUntil: new Date(Date.now() + 60_000) },
    });
    await db.session.create({
      data: { id: "reset-session", token: "reset-token", userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await resetPassword(db, ADMIN, user.id);
    if (!result.ok) throw new Error(result.error);

    expect(await verifyPassword({ hash: await passwordOf(user.id), password: result.value.temporaryPassword })).toBe(
      true,
    );
    expect(await verifyPassword({ hash: await passwordOf(user.id), password: created.value.temporaryPassword })).toBe(
      false,
    );
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      mustChangePassword: true,
      failedSignIns: 0,
      lockedUntil: null,
    });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await accountHistory(db, user.id))[0].action).toBe("password_reset");
  });
});

describe("disabling an account (ADM-6)", () => {
  it("disables and re-enables an officer, ending their sessions", async () => {
    const created = await createAccount(db, ADMIN, officer(homagama));
    if (!created.ok) throw new Error(created.error);
    const user = await db.user.findUniqueOrThrow({ where: { username: created.value.username } });
    await db.session.create({
      data: {
        id: "disable-session",
        token: "disable-token",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(await setAccountDisabled(db, ADMIN, user.id, true)).toEqual({ ok: true, value: null });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).banned).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    expect(await setAccountDisabled(db, ADMIN, user.id, false)).toEqual({ ok: true, value: null });
    expect((await accountHistory(db, user.id)).map((h) => h.action).slice(0, 2)).toEqual([
      "account_enabled",
      "account_disabled",
    ]);
  });

  it("won't let an admin disable themselves, or the last active admin", async () => {
    expect(await setAccountDisabled(db, ADMIN, ADMIN, true)).toEqual({ ok: false, error: "self" });
    const otherAdmin = await createAccount(db, ADMIN, { ...officer(homagama), role: "ADMIN", dsOfficeId: null });
    if (!otherAdmin.ok) throw new Error(otherAdmin.error);
    const other = await db.user.findUniqueOrThrow({ where: { username: otherAdmin.value.username } });

    // With another active admin, disabling that one is allowed...
    expect(await setAccountDisabled(db, ADMIN, other.id, true)).toEqual({ ok: true, value: null });
    // ...and once ADMIN is the only active admin left (other test files may have made admins too),
    // it can't be demoted by someone else either.
    await db.user.updateMany({ where: { role: "ADMIN", id: { not: ADMIN } }, data: { banned: true } });
    expect(
      await updateAccount(db, other.id, ADMIN, { ...officer(homagama), role: "HO_OFFICER", dsOfficeId: null }),
    ).toEqual({
      ok: false,
      error: "lastAdmin",
    });
  });
});

describe("the account list (ADM-1)", () => {
  it("finds accounts by office name and filters by role", async () => {
    const found = await listAccounts(db, { q: "හෝමාගම", role: "DS_OFFICER" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((row) => row.officeName === "හෝමාගම" && row.role === "DS_OFFICER")).toBe(true);
    expect(await listAccounts(db, { role: "HO_OFFICER", q: "හෝමාගම" })).toEqual([]);
  });
});
