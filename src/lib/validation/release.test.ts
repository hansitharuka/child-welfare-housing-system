import { describe, expect, it } from "vitest";
import { parseReason } from "./decision";
import { parseReleaseForm, type ReleaseField } from "./release";

const limits = { earliest: "2026-09-10", today: "2026-09-28" };
const form = (values: Partial<Record<ReleaseField, string>>) => (field: ReleaseField) =>
  values[field] ?? { releasedOn: "2026-09-20", referenceNumber: "HO/2026/0141", note: "" }[field];

describe("the release form (REL-2)", () => {
  it("accepts a day from the verification to today, and trims the text", () => {
    expect(parseReleaseForm(form({ referenceNumber: "  HO/1  " }), limits)).toEqual({
      ok: true,
      value: { releasedOn: "2026-09-20", referenceNumber: "HO/1", note: null },
    });
    expect(parseReleaseForm(form({ releasedOn: "2026-09-10" }), limits).ok).toBe(true);
    expect(parseReleaseForm(form({ releasedOn: "2026-09-28" }), limits).ok).toBe(true);
  });

  it("refuses a missing, impossible, future or too early date", () => {
    const error = (releasedOn: string) => {
      const result = parseReleaseForm(form({ releasedOn }), limits);
      return result.ok ? null : result.errors.releasedOn;
    };
    expect(error("")).toBe("dateRequired");
    expect(error("2026-02-30")).toBe("dateInvalid");
    expect(error("2026-09-29")).toBe("dateInFuture");
    expect(error("2026-09-09")).toBe("dateBeforeVerified");
  });

  it("needs a reference number of at most 50 characters, and a note of at most 500", () => {
    expect(parseReleaseForm(form({ referenceNumber: "   " }), limits)).toEqual({
      ok: false,
      errors: { referenceNumber: "referenceRequired" },
    });
    expect(parseReleaseForm(form({ referenceNumber: "x".repeat(51), note: "x".repeat(501) }), limits)).toEqual({
      ok: false,
      errors: { referenceNumber: "referenceTooLong", note: "noteTooLong" },
    });
  });
});

describe("a reason (CHK-3)", () => {
  it("needs 5 to 1,000 characters after trimming", () => {
    expect(parseReason("   ")).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseReason(" නැත ")).toEqual({ ok: false, error: "reasonTooShort" });
    expect(parseReason("x".repeat(1001))).toEqual({ ok: false, error: "reasonTooLong" });
    expect(parseReason("  ලිපිනය සම්පූර්ණ නැත.  ")).toEqual({ ok: true, value: "ලිපිනය සම්පූර්ණ නැත." });
  });
});
