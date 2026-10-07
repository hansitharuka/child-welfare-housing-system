import { describe, expect, it } from "vitest";
import places from "../../data/places.json";
import stages from "../../data/stages.json";

describe("seed lists", () => {
  it("has the 9 provinces and 25 districts of Sri Lanka", () => {
    expect(places.provinces).toHaveLength(9);
    expect(places.districts).toHaveLength(25);
  });

  it("puts every district in a known province", () => {
    const provinces = new Set(places.provinces.map((p) => p.nameEn));
    for (const d of places.districts) expect(provinces, d.nameEn).toContain(d.province);
  });

  it("puts every DS office in a known district", () => {
    const districts = new Set(places.districts.map((d) => d.nameEn));
    for (const o of places.dsOffices) expect(districts, o.code).toContain(o.district);
  });

  it("gives every DS office a unique three-letter code (CASE-5)", () => {
    const codes = places.dsOffices.map((o) => o.code);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps DS office names unique within a district (LST-2)", () => {
    const keys = places.dsOffices.map((o) => `${o.district}/${o.nameSi}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists the four new-house stages in order and no renovation stages yet (LST-4)", () => {
    expect(stages.NEW_HOUSE.map((s) => s.nameSi)).toEqual(["අත්තිවාරම් මට්ටම", "බිත්ති මට්ටම", "වහල මට්ටම", "නිමයි"]);
    expect(stages.NEW_HOUSE.map((s) => s.nameEn)).toEqual([
      "Foundation level",
      "Wall level",
      "Roof level",
      "Completed",
    ]);
    expect(stages.RENOVATION).toEqual([]);
  });

  it("names every place and stage in Sinhala, Tamil and English, each in its own script (UI-9)", () => {
    const named = [...places.provinces, ...places.districts, ...places.dsOffices, ...stages.NEW_HOUSE];
    for (const row of named) {
      expect(row.nameSi, row.nameEn).toMatch(/^[\u0D80-\u0DFF\u200C\u200D .\/&()-]+$/);
      expect(row.nameTa, row.nameEn).toMatch(/^[\u0B80-\u0BFF .\/&()-]+$/);
      expect(row.nameEn, row.nameSi).toMatch(/^[A-Za-z .'\/&-]+$/);
    }
  });

  it("gives each province and district its own Tamil name", () => {
    for (const list of [places.provinces, places.districts]) {
      const names = list.map((p) => p.nameTa);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
