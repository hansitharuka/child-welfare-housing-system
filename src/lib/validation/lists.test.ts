import { describe, expect, it } from "vitest";
import places from "../../../data/places.json";
import { officeNamesSchema, officeSchema, parseForm } from "./lists";

const names =
  (nameSi: string, nameEn: string, nameTa = "கொழும்பு") =>
  (field: string) =>
    ({ nameSi, nameTa, nameEn })[field] ?? "";

describe("a DS office's names (LST-2, UI-9)", () => {
  it("accepts an English name in two parts, as some Northern and Eastern offices have", () => {
    const kopay = names("වලිකාමම් නැගෙනහිර / කෝපායි", "Valikamam East / Kopay", "வலிகாமம் கிழக்கு / கோப்பாய்");
    expect(parseForm(officeNamesSchema, kopay)).toEqual({
      ok: true,
      value: {
        nameSi: "වලිකාමම් නැගෙනහිර / කෝපායි",
        nameTa: "வலிகாமம் கிழக்கு / கோப்பாய்",
        nameEn: "Valikamam East / Kopay",
      },
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

  it("asks for the Tamil name in Tamil letters", () => {
    expect(parseForm(officeNamesSchema, names("කොළඹ", "Colombo", ""))).toEqual({
      ok: false,
      errors: { nameTa: "required" },
    });
    for (const wrong of ["Colombo", "කොළඹ"]) {
      expect(parseForm(officeNamesSchema, names("කොළඹ", "Colombo", wrong))).toEqual({
        ok: false,
        errors: { nameTa: "tamilName" },
      });
    }
  });

  it("accepts every office in the seed list, so the admin can rename any of them", () => {
    for (const office of places.dsOffices) expect(officeSchema.safeParse(office).success, office.code).toBe(true);
  });
});
