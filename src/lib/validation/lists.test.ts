import { describe, expect, it } from "vitest";
import places from "../../../data/places.json";
import { officeNamesSchema, officeSchema, parseForm } from "./lists";

const names = (nameSi: string, nameEn: string) => (field: string) => ({ nameSi, nameEn })[field] ?? "";

describe("a DS office's names (LST-2)", () => {
  it("accepts an English name in two parts, as some Northern and Eastern offices have", () => {
    expect(parseForm(officeNamesSchema, names("වලිකාමම් නැගෙනහිර / කෝපායි", "Valikamam East / Kopay"))).toEqual({
      ok: true,
      value: { nameSi: "වලිකාමම් නැගෙනහිර / කෝපායි", nameEn: "Valikamam East / Kopay" },
    });
    expect(
      parseForm(officeNamesSchema, names("මන්මුනේ දකුණ සහ එරාවුර්පත්තු", "Manmunai South & Eruvil Pattu")).ok,
    ).toBe(true);
  });

  it("refuses an English name in other letters or symbols", () => {
    expect(parseForm(officeNamesSchema, names("කොළඹ", "කොළඹ"))).toEqual({
      ok: false,
      errors: { nameEn: "englishName" },
    });
    expect(parseForm(officeNamesSchema, names("කොළඹ", "Colombo (1)")).ok).toBe(false);
  });

  it("accepts every office in the seed list, so the admin can rename any of them", () => {
    for (const office of places.dsOffices) expect(officeSchema.safeParse(office).success, office.code).toBe(true);
  });
});
