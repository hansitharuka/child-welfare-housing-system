import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, staticSecurityHeaders } from "./security-headers";

describe("security headers (SEC-5)", () => {
  it("allows scripts only from this site with the request's nonce", () => {
    const csp = contentSecurityPolicy("abc123", { development: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds eval only in development", () => {
    expect(contentSecurityPolicy("n", { development: true })).toContain("'unsafe-eval'");
  });

  it("loads nothing from other sites", () => {
    const csp = contentSecurityPolicy("n", { development: false });
    expect(csp).not.toMatch(/https?:/);
  });

  it("sends HSTS only in production", () => {
    const keys = (production: boolean) => staticSecurityHeaders({ production }).map((h) => h.key);
    expect(keys(true)).toContain("Strict-Transport-Security");
    expect(keys(false)).not.toContain("Strict-Transport-Security");
    expect(keys(false)).toEqual(
      expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]),
    );
  });
});
