/** AUTH-2: 5 wrong passwords in a row lock the account for 15 minutes. */
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;

/** SEC-4: an unused temporary password stops working after 7 days. */
export const TEMPORARY_PASSWORD_DAYS = 7;

export type LockState = { failedSignIns: number; lockedUntil: Date | null };

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** The lock state to save after a wrong password. */
export function afterFailedSignIn(state: LockState, now: Date): LockState {
  // A lock that has run out starts the count again.
  const previous = state.lockedUntil !== null && !isLocked(state, now) ? 0 : state.failedSignIns;
  const failedSignIns = previous + 1;
  if (failedSignIns >= MAX_FAILED_SIGN_INS) {
    return { failedSignIns: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
  }
  return { failedSignIns, lockedUntil: null };
}

/** The lock state to save after a correct password. */
export const AFTER_SUCCESSFUL_SIGN_IN: LockState = { failedSignIns: 0, lockedUntil: null };

export function temporaryPasswordExpired(
  user: { mustChangePassword: boolean; temporaryPasswordSetAt: Date | null },
  now: Date,
): boolean {
  if (!user.mustChangePassword || user.temporaryPasswordSetAt === null) return false;
  return now.getTime() - user.temporaryPasswordSetAt.getTime() > TEMPORARY_PASSWORD_DAYS * 24 * 60 * 60_000;
}
