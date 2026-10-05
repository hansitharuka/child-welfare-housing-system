import { describe, expect, it } from "vitest";
import { type ConfirmField, parseConfirmForm } from "./confirm";

const TODAY = "2026-10-05";
const RELEASE = { releasedOn: "2025-03-10", referenceNumber: "HO/2025/17", note: "" };

const read = (values: Partial<Record<ConfirmField, string>>) => (field: ConfirmField) => values[field] ?? "";
const parse = (values: Partial<Record<ConfirmField, string>>) => parseConfirmForm(read(values), TODAY);

describe("confirming a case from the sheet (IMP-5)", () => {
  it("needs a choice", () => {
    expect(parse({})).toEqual({ ok: false, errors: { outcome: "outcomeRequired" } });
    expect(parse({ outcome: "COMPLETED" })).toEqual({ ok: false, errors: { outcome: "outcomeRequired" } });
  });

  it("approves with nothing else, and ignores what other choices would take", () => {
    expect(parse({ outcome: "verified", reason: "x", releasedOn: "bad" })).toEqual({
      ok: true,
      value: { outcome: "verified" },
    });
  });

  it("rejects and stops with a reason of 5 to 1,000 characters (CHK-3, CLS-2)", () => {
    expect(parse({ outcome: "rejected" })).toEqual({ ok: false, errors: { reason: "reasonRequired" } });
    expect(parse({ outcome: "stopped", reason: "අඩු" })).toEqual({ ok: false, errors: { reason: "reasonTooShort" } });
    expect(parse({ outcome: "stopped", reason: "  ඉඩම නොමැති නිසා  " })).toEqual({
      ok: true,
      value: { outcome: "stopped", reason: "ඉඩම නොමැති නිසා" },
    });
  });

  it("takes the release and every installment's status and day for a case in progress (REL-2, INS-3, INS-4)", () => {
    const result = parse({
      outcome: "inProgress",
      ...RELEASE,
      status1: "RELEASED",
      day1: "2025-04-01",
      status2: "RELEASED",
      day2: "2025-04-01",
      status3: "PROCESSING",
      // An expected day may be in the future.
      day3: "2026-12-01",
      day4: "2026-01-01",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        outcome: "inProgress",
        release: { ...RELEASE, note: null },
        installments: [
          { number: 1, status: "RELEASED", expectedOn: null, releasedOn: "2025-04-01" },
          { number: 2, status: "RELEASED", expectedOn: null, releasedOn: "2025-04-01" },
          { number: 3, status: "PROCESSING", expectedOn: "2026-12-01", releasedOn: null },
          // Not started: a day typed before the status changed is dropped.
          { number: 4, status: "NOT_STARTED", expectedOn: null, releasedOn: null },
        ],
      },
    });
  });

  it("has no earliest release day, since the sheet has no verification date, but no future one", () => {
    const base = { outcome: "inProgress" } as const;
    expect(parse({ ...base, ...RELEASE, releasedOn: "2019-01-01" }).ok).toBe(true);
    expect(parse({ ...base, ...RELEASE, releasedOn: "2026-10-06" })).toEqual({
      ok: false,
      errors: { releasedOn: "dateInFuture" },
    });
    expect(parse({ ...base, releasedOn: "", referenceNumber: "" })).toEqual({
      ok: false,
      errors: { releasedOn: "dateRequired", referenceNumber: "referenceRequired" },
    });
  });

  it("keeps the installments in order: paid ones first, then at most one under way (INS-2)", () => {
    const base = { outcome: "inProgress", ...RELEASE } as const;
    expect(parse({ ...base, status2: "RELEASED", day2: "2025-04-01" })).toEqual({
      ok: false,
      errors: { status2: "notInOrder" },
    });
    expect(
      parse({ ...base, status1: "PROCESSING", day1: "2025-05-01", status2: "PROCESSING", day2: "2025-05-01" }),
    ).toEqual({ ok: false, errors: { status2: "notInOrder" } });
  });

  it("checks each day as the DS office's own steps do (INS-3, INS-4)", () => {
    const base = { outcome: "inProgress", ...RELEASE } as const;
    expect(parse({ ...base, status1: "RELEASED" })).toEqual({ ok: false, errors: { day1: "dateRequired" } });
    expect(parse({ ...base, status1: "RELEASED", day1: "2025-03-09" })).toEqual({
      ok: false,
      errors: { day1: "dateBeforeRelease" },
    });
    expect(parse({ ...base, status1: "RELEASED", day1: "2026-10-06" })).toEqual({
      ok: false,
      errors: { day1: "dateInFuture" },
    });
    expect(
      parse({ ...base, status1: "RELEASED", day1: "2025-06-01", status2: "RELEASED", day2: "2025-05-31" }),
    ).toEqual({ ok: false, errors: { day2: "dateBeforePrevious" } });
    expect(parse({ ...base, status1: "PROCESSING", day1: "2025-03-01" })).toEqual({
      ok: false,
      errors: { day1: "dateBeforeRelease" },
    });
  });

  it("still checks the installments' days when the release day is missing", () => {
    expect(parse({ outcome: "inProgress", referenceNumber: "HO/1", status1: "RELEASED", day1: "2026-10-06" })).toEqual({
      ok: false,
      errors: { releasedOn: "dateRequired", day1: "dateInFuture" },
    });
  });
});
