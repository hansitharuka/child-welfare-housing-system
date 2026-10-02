import { describe, expect, it } from "vitest";
import { isValidPhone, normalisePhone } from "./phone";

describe("phone numbers (CASE-2)", () => {
  it("accepts 10 digits starting with 0, once spaces are removed", () => {
    expect(isValidPhone(normalisePhone("0712345678"))).toBe(true);
    expect(isValidPhone(normalisePhone("071 234 5678"))).toBe(true);
    expect(normalisePhone(" 071 234 5678 ")).toBe("0712345678");
  });

  it("refuses other numbers", () => {
    for (const phone of ["712345678", "07123456789", "071234567", "+94712345678", "071-234-5678", "", "07123A5678"]) {
      expect(isValidPhone(normalisePhone(phone)), phone).toBe(false);
    }
  });
});
