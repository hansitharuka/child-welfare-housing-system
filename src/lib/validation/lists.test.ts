import { describe, expect, it } from "vitest";
import places from "../../../data/places.json";
import { officeSchema, readNames } from "./lists";

const form = (fields: Record<string, string>) => (field: string) => fields[field] ?? "";

describe("a DS office's or stage's names (LST-2, LST-4, UI-9)", () => {
  it("accepts an English name in two parts, as some Northern and Eastern offices have", () => {
    const kopay = {
      nameSi: "වලිකාමම් නැගෙනහිර / කෝපායි",
      nameTa: "வலிகாமம் கிழக்கு / கோப்பாய்",
      nameEn: "Valikamam East / Kopay",
    };
    expect(readNames(form(kopay), "si")).toEqual({ ok: true, value: kopay, written: false });
    expect(readNames(form({ nameEn: "Manmunai South & Eruvil Pattu" }), "en").ok).toBe(true);
  });

  it("refuses an English name in other letters or symbols", () => {
    expect(readNames(form({ nameSi: "කොළඹ", nameEn: "කොළඹ" }), "si")).toEqual({
      ok: false,
      errors: { nameEn: "englishName" },
    });
    expect(readNames(form({ nameEn: "Colombo (1)" }), "en")).toEqual({ ok: false, errors: { nameEn: "englishName" } });
  });

  it("asks for a typed Tamil name in Tamil letters", () => {
    for (const wrong of ["Colombo", "කොළඹ"]) {
      expect(readNames(form({ nameSi: "කොළඹ", nameTa: wrong }), "si")).toEqual({
        ok: false,
        errors: { nameTa: "tamilName" },
      });
    }
  });

  it("needs only the name in the screen's language, and writes the other two from it", () => {
    expect(readNames(form({ nameSi: " හෝමාගම " }), "si")).toEqual({
      ok: true,
      value: { nameSi: "හෝමාගම", nameTa: "ஹோமாகம", nameEn: "Homagama" },
      written: true,
    });
    expect(readNames(form({ nameTa: "உடுவில்" }), "ta")).toEqual({
      ok: true,
      value: { nameSi: "උඩුවිල්", nameTa: "உடுவில்", nameEn: "Uduvil" },
      written: true,
    });
  });

  it("keeps a name the admin typed in another language", () => {
    expect(readNames(form({ nameSi: "කොළඹ", nameEn: "Colombo" }), "si")).toEqual({
      ok: true,
      value: { nameSi: "කොළඹ", nameTa: "கொளம்ப", nameEn: "Colombo" },
      written: true,
    });
  });

  it("asks for the name in the screen's language, even when the others are typed", () => {
    expect(readNames(form({ nameSi: "කොළඹ", nameEn: "Colombo" }), "ta")).toEqual({
      ok: false,
      errors: { nameTa: "required" },
    });
  });

  it("asks the admin to type a name that the system can't write within that language's rules", () => {
    // Tamil and English names hold letters only.
    expect(readNames(form({ nameSi: "කොළඹ 7" }), "si")).toEqual({
      ok: false,
      errors: { nameTa: "writeName", nameEn: "writeName" },
    });
  });

  it("accepts every office in the seed list, so the admin can rename any of them", () => {
    for (const office of places.dsOffices) expect(officeSchema.safeParse(office).success, office.code).toBe(true);
  });
});
