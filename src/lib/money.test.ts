import { describe, expect, it } from "vitest";
import { balance, formatRupees, paidOut, RELEASE_AMOUNT } from "./money";

describe("formatRupees", () => {
  it("adds the rupee label and thousand separators", () => {
    expect(formatRupees(2_000_000)).toBe("රු. 2,000,000");
    expect(formatRupees(500_000)).toBe("රු. 500,000");
    expect(formatRupees(0)).toBe("රු. 0");
  });

  it("shows a negative balance with a minus sign", () => {
    expect(formatRupees(-500_000)).toBe("රු. -500,000");
  });

  it("refuses amounts that are not whole rupees", () => {
    expect(() => formatRupees(10.5)).toThrow(RangeError);
    expect(() => formatRupees(Number.NaN)).toThrow(RangeError);
  });
});

describe("paid out and balance (CLS-2, HOME-4)", () => {
  const installments = [
    { amount: 500_000, status: "RELEASED" },
    { amount: 500_000, status: "RELEASED" },
    { amount: 500_000, status: "PROCESSING" },
    { amount: 500_000, status: "NOT_STARTED" },
  ];

  it("counts only the installments marked paid", () => {
    expect(paidOut(installments)).toBe(1_000_000);
    expect(paidOut([])).toBe(0);
  });

  it("leaves the rest of the release with the DS office, and nothing before a release", () => {
    expect(balance({ amount: RELEASE_AMOUNT }, installments)).toBe(1_000_000);
    expect(balance(null, [])).toBe(0);
  });
});
