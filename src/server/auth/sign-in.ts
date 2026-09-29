import "server-only";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { writeAudit } from "../audit";
import type { Context } from "../context";
import { db } from "../db";
import { logEvent } from "../log";
import { normaliseUsername } from "./accounts";
import { AFTER_SUCCESSFUL_SIGN_IN, afterFailedSignIn, isLocked, temporaryPasswordExpired } from "./lockout";
import { isRole, type Role } from "./roles";

export type SignInResult = { ok: true; role: Role; mustChangePassword: boolean } | { ok: false };

function errorCode(error: { body?: unknown }): string | null {
  const body = error.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : null;
}

/**
 * Checks a username and password (AUTH-1) and, if they are right, starts a session.
 * Every refusal looks the same to the person signing in, whether the username exists, the password
 * is wrong, the account is locked or disabled, or the temporary password has expired (AUTH-2).
 */
export async function attemptSignIn(
  input: { username: string; password: string },
  requestHeaders: Headers,
): Promise<SignInResult> {
  const accountName = normaliseUsername(input.username);
  const now = new Date();
  const user = await db.user.findUnique({
    where: { username: accountName },
    select: {
      id: true,
      role: true,
      failedSignIns: true,
      lockedUntil: true,
      mustChangePassword: true,
      temporaryPasswordSetAt: true,
    },
  });

  if (user && isLocked(user, now)) {
    logEvent("sign_in_refused", { reason: "locked", userId: user.id });
    return { ok: false };
  }
  if (user && temporaryPasswordExpired(user, now)) {
    logEvent("sign_in_refused", { reason: "temporary_password_expired", userId: user.id });
    return { ok: false };
  }

  try {
    await auth.api.signInUsername({
      body: { username: accountName, password: input.password },
      headers: requestHeaders,
    });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    if (user && error.statusCode === 401) {
      const next = afterFailedSignIn(user, now);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: next });
        if (next.lockedUntil) {
          await writeAudit(tx, {
            actorId: null,
            action: "account_locked",
            entityType: "user",
            entityId: user.id,
            after: { lockedUntil: next.lockedUntil.toISOString() },
          });
        }
      });
      logEvent("sign_in_failed", { userId: user.id, locked: next.lockedUntil !== null });
    } else {
      logEvent("sign_in_failed", { reason: user ? (errorCode(error) ?? String(error.statusCode)) : "unknown_user" });
    }
    return { ok: false };
  }

  // Better Auth accepted the password, so the user exists. A missing role is refused again by getContext().
  if (!user || !isRole(user.role)) return { ok: false };

  await db.user.update({ where: { id: user.id }, data: { ...AFTER_SUCCESSFUL_SIGN_IN, lastSignInAt: now } });
  logEvent("sign_in", { userId: user.id });
  return { ok: true, role: user.role, mustChangePassword: user.mustChangePassword };
}

/**
 * Replaces the signed-in user's password (AUTH-3). All their other sessions end, and a temporary
 * password stops being temporary.
 */
export async function changeOwnPassword(
  context: Context,
  input: { current: string; next: string },
  requestHeaders: Headers,
): Promise<{ ok: true } | { ok: false; error: "currentWrong" }> {
  try {
    await auth.api.changePassword({
      body: { currentPassword: input.current, newPassword: input.next, revokeOtherSessions: true },
      headers: requestHeaders,
    });
  } catch (error) {
    if (isAPIError(error) && errorCode(error) === "INVALID_PASSWORD") return { ok: false, error: "currentWrong" };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: context.userId },
      data: { mustChangePassword: false, temporaryPasswordSetAt: null },
    });
    await writeAudit(tx, {
      actorId: context.userId,
      action: "password_changed",
      entityType: "user",
      entityId: context.userId,
    });
  });
  logEvent("password_changed", { userId: context.userId });
  return { ok: true };
}

export async function signOutCurrentSession(requestHeaders: Headers): Promise<void> {
  await auth.api.signOut({ headers: requestHeaders });
}
