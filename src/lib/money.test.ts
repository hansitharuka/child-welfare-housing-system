import { describe, expect, it } from "vitest";
import { balance, formatNumber, formatRupees, paidOut, RELEASE_AMOUNT } from "./money";

describe("formatNumber", () => {
  it("writes Western digits with thousand separators", () => {
    expect(formatNumber(7_600_000_000)).toBe("7,600,000,000");
    expect(formatNumber(4_812)).toBe("4,812");
    expect(formatNumber(0)).toBe("0");
  });

  it("refuses anything but whole numbers", () => {
    expect(() => formatNumber(1.5)).toThrow(RangeError);
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatRupees", () => {
  it("adds the rupee label and thousand separators", () => {
    expect(formatRupees(2_000_000, "si")).toBe("රු. 2,000,000");
    expect(formatRupees(500_000, "si")).toBe("රු. 500,000");
    expect(formatRupees(0, "si")).toBe("රු. 0");
  });

  it("writes the rupee label in the screen's language", () => {
    expect(formatRupees(2_000_000, "ta")).toBe("ரூ. 2,000,000");
    expect(formatRupees(2_000_000, "en")).toBe("Rs. 2,000,000");
  });

  it("shows a negative balance with a minus sign", () => {
    expect(formatRupees(-500_000, "si")).toBe("රු. -500,000");
  });

  it("refuses amounts that are not whole rupees", () => {
    expect(() => formatRupees(10.5, "si")).toThrow(RangeError);
    expect(() => formatRupees(Number.NaN, "en")).toThrow(RangeError);
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
