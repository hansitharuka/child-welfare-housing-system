import { describe, expect, it } from "vitest";
import type { DistrictOptions } from "../lists/queries";
import { type Figures, noFigures, tableRows } from "./queries";

const districts: DistrictOptions[] = [
  {
    id: 1,
    name: "කොළඹ",
    offices: [
      { id: 10, name: "හෝමාගම", active: true },
      { id: 11, name: "මහරගම", active: true },
      { id: 12, name: "පැරණි කාර්යාලය", active: false },
      { id: 13, name: "වසා දැමූ කාර්යාලය", active: false },
    ],
  },
  { id: 2, name: "ගම්පහ", offices: [{ id: 20, name: "ගම්පහ", active: true }] },
  { id: 3, name: "කළුතර", offices: [] },
];

const of = (cases: number, inProgress = 0, completed = 0): Figures => ({
  cases,
  inProgress,
  completed,
  released: (inProgress + completed) * 2_000_000,
  paidOut: completed * 2_000_000,
});

const byOffice = new Map<number, Figures>([
  [10, of(5, 3, 1)],
  [11, of(2, 1)],
  [12, of(1, 0, 1)],
  [20, of(4, 4)],
]);

describe("the dashboard table (DSH-1)", () => {
  it("shows every district, with or without cases, adding up its offices", () => {
    const rows = tableRows(districts, byOffice);
    expect(rows.map((r) => [r.name, r.cases, r.inProgress, r.completed, r.released, r.paidOut])).toEqual([
      ["කොළඹ", 8, 4, 2, 12_000_000, 4_000_000],
      ["ගම්පහ", 4, 4, 0, 8_000_000, 0],
      ["කළුතර", 0, 0, 0, 0, 0],
    ]);
  });

  it("opens a district into its DS offices, showing an inactive one only while it has cases", () => {
    const rows = tableRows(districts, byOffice, 1);
    expect(rows.map((r) => [r.id, r.active, r.cases])).toEqual([
      [10, true, 5],
      [11, true, 2],
      [12, false, 1],
    ]);
    expect(tableRows(districts, new Map(), 2)).toEqual([{ id: 20, name: "ගම්පහ", active: true, ...noFigures() }]);
  });

  it("has no rows for a district without offices or one it doesn't know", () => {
    expect(tableRows(districts, byOffice, 3)).toEqual([]);
    expect(tableRows(districts, byOffice, 99)).toEqual([]);
  });
});
