import { isRole } from "./roles";

/** AUTH-4: a session ends 12 hours after sign-in at the latest... */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
/** ...and after 30 minutes without activity. */
export const SESSION_IDLE_LIMIT_MS = 30 * 60_000;
/** Activity is written to the database at most once a minute per session. */
export const ACTIVITY_WRITE_INTERVAL_MS = 60_000;

export type SessionVerdict = "ok" | "idle" | "too-old" | "disabled" | "no-role";

/** Decides whether a stored session may still be used (AUTH-4, AUTH-5). */
export function sessionVerdict(
  session: { createdAt: Date; lastActiveAt: Date; banned: boolean | null; role: string | null },
  now: Date,
): SessionVerdict {
  if (session.banned) return "disabled";
  if (!isRole(session.role)) return "no-role";
  if (now.getTime() - session.createdAt.getTime() > SESSION_MAX_AGE_SECONDS * 1000) return "too-old";
  if (now.getTime() - session.lastActiveAt.getTime() > SESSION_IDLE_LIMIT_MS) return "idle";
  return "ok";
}

export function shouldRecordActivity(lastActiveAt: Date, now: Date): boolean {
  return now.getTime() - lastActiveAt.getTime() >= ACTIVITY_WRITE_INTERVAL_MS;
}
