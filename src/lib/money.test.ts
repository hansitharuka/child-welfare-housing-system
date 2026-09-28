import { describe, expect, it } from "vitest";
import { formatRupees } from "./money";

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
