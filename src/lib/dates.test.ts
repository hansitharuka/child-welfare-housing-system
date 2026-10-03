import { describe, expect, it } from "vitest";
import { colomboYear, dateToDay, dayToDate, daysBetween, formatDate, parseDay } from "./dates";

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

describe("colomboYear", () => {
  it("changes at midnight in Colombo, not in UTC", () => {
    // 19:00 UTC on 31 Dec is 00:30 on 1 Jan in Colombo.
    expect(colomboYear(new Date("2026-12-31T19:00:00Z"))).toBe(2027);
    expect(colomboYear(new Date("2026-12-31T18:00:00Z"))).toBe(2026);
  });
});

describe("daysBetween", () => {
  it("counts calendar days in Colombo", () => {
    const morning = new Date("2026-09-28T03:00:00Z");
    expect(daysBetween(morning, new Date("2026-09-28T12:00:00Z"))).toBe(0);
    // 19:00 UTC on 28 Sep is already 29 Sep in Colombo.
    expect(daysBetween(morning, new Date("2026-09-28T19:00:00Z"))).toBe(1);
    expect(daysBetween(morning, new Date("2026-10-08T03:00:00Z"))).toBe(10);
  });
});

describe("calendar days", () => {
  it("accepts a real day and refuses anything else", () => {
    expect(parseDay("2026-02-28")).toBe("2026-02-28");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
    expect(parseDay("2026-02-29")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("2026.09.28")).toBeNull();
    expect(parseDay("")).toBeNull();
  });

  it("stores a day as midnight UTC and reads it back unchanged", () => {
    expect(dayToDate("2026-09-28").toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(dateToDay(dayToDate("2026-09-28"))).toBe("2026-09-28");
    expect(formatDate(dateToDay(dayToDate("2026-01-05")))).toBe("2026.01.05");
  });
});
