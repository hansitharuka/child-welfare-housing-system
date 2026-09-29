import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("sign-in rate limit (SEC-4)", () => {
  it("allows 10 attempts a minute per address, then refuses", () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i += 1) expect(limiter.allow("10.0.0.1", 1_000 + i)).toBe(true);
    expect(limiter.allow("10.0.0.1", 2_000)).toBe(false);
    expect(limiter.allow("10.0.0.2", 2_000)).toBe(true);
  });

  it("allows attempts again in the next minute", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 59_999)).toBe(false);
    expect(limiter.allow("ip", 60_000)).toBe(true);
  });

  it("reads the client address from the proxy's header", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.6" }))).toBe("203.0.113.6");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
