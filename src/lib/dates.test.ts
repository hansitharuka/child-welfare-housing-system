import { describe, expect, it } from "vitest";
import { formatDate } from "./dates";

describe("formatDate", () => {
  it("writes a calendar date as YYYY.MM.DD", () => {
    expect(formatDate("2026-09-28")).toBe("2026.09.28");
  });

  it("uses Colombo time for a moment in time", () => {
    // 20:00 UTC on 27 Sep is 01:30 on 28 Sep in Colombo (UTC+5:30).
    expect(formatDate(new Date("2026-09-27T20:00:00Z"))).toBe("2026.09.28");
    expect(formatDate(new Date("2026-09-27T18:00:00Z"))).toBe("2026.09.27");
  });

  it("pads single-digit months and days", () => {
    expect(formatDate(new Date("2026-01-05T06:00:00Z"))).toBe("2026.01.05");
  });

  it("refuses something that is not a date", () => {
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });
});
