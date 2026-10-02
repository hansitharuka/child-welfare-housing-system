import { describe, expect, it } from "vitest";
import { isValidNic, nicKey, normaliseNic } from "./nic";

describe("NIC rules (CASE-2, AC-6)", () => {
  it("accepts the old and new formats", () => {
    expect(isValidNic("880001234V")).toBe(true);
    expect(isValidNic("880001234X")).toBe(true);
    expect(isValidNic("198800012345")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const nic of [
      "12345",
      "",
      "88000123V",
      "8800012345V",
      "880001234Y",
      "19880001234",
      "1988000123456",
      "ABCDEFGHIJ",
    ]) {
      expect(isValidNic(nic), nic).toBe(false);
    }
  });

  it("is stored in capitals without spaces", () => {
    expect(normaliseNic(" 880001234v ")).toBe("880001234V");
    expect(normaliseNic("1988 0001 2345")).toBe("198800012345");
    expect(isValidNic(normaliseNic("880001234v"))).toBe(true);
  });
});

describe("NIC matching key (CASE-6)", () => {
  it("turns an old number into its 12-digit form", () => {
    expect(nicKey("880001234V")).toBe("198800001234");
    expect(nicKey("880001234x")).toBe("198800001234");
    expect(nicKey("923456789V")).toBe("199234506789");
  });

  it("keeps a new number as it is", () => {
    expect(nicKey("198800001234")).toBe("198800001234");
    expect(nicKey("2001 2345 6789")).toBe("200123456789");
  });

  it("matches an old number with the new number of the same person (AC-6)", () => {
    expect(nicKey("880001234V")).toBe(nicKey("198800001234"));
    expect(nicKey("880001234V")).not.toBe(nicKey("198800012345"));
  });

  it("gives nothing for an invalid number", () => {
    expect(nicKey("12345")).toBeNull();
    expect(nicKey("")).toBeNull();
  });
});
