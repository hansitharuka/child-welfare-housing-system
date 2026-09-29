import { describe, expect, it } from "vitest";
import { sessionVerdict, shouldRecordActivity } from "./session-rules";

const now = new Date("2026-09-29T09:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const good = { createdAt: ago(60), lastActiveAt: ago(5), banned: false, role: "DS_OFFICER" };

describe("session limits (AUTH-4, AUTH-5)", () => {
  it("accepts an active session", () => {
    expect(sessionVerdict(good, now)).toBe("ok");
  });

  it("ends a session after 30 minutes without activity", () => {
    expect(sessionVerdict({ ...good, lastActiveAt: ago(29) }, now)).toBe("ok");
    expect(sessionVerdict({ ...good, lastActiveAt: ago(31) }, now)).toBe("idle");
  });

  it("ends every session 12 hours after sign-in", () => {
    expect(sessionVerdict({ ...good, createdAt: ago(11 * 60), lastActiveAt: ago(1) }, now)).toBe("ok");
    expect(sessionVerdict({ ...good, createdAt: ago(12 * 60 + 1), lastActiveAt: ago(1) }, now)).toBe("too-old");
  });

  it("ends the session of a disabled account at once", () => {
    expect(sessionVerdict({ ...good, banned: true }, now)).toBe("disabled");
  });

  it("refuses an account without a valid role", () => {
    expect(sessionVerdict({ ...good, role: null }, now)).toBe("no-role");
    expect(sessionVerdict({ ...good, role: "user" }, now)).toBe("no-role");
  });

  it("writes activity at most once a minute", () => {
    expect(shouldRecordActivity(new Date(now.getTime() - 30_000), now)).toBe(false);
    expect(shouldRecordActivity(ago(1), now)).toBe(true);
  });
});
