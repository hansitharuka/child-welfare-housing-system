import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import places from "../data/places.json";
import type { Category } from "../src/generated/prisma/enums";
import { CARE_LEAVER_TAB, CHILD_AT_RISK_TAB, makeSampleSheet, type Quirk, QUIRKS } from "./make-sample-sheet";

const ZWJ = "‍";
/** A cell covered by a merged range that starts in another cell. */
const M = "(merged)";

/** The sample as the import will see it: written to a file and read back. */
async function readBack(seed: number) {
  const { workbook, rows } = makeSampleSheet(seed);
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await workbook.xlsx.writeBuffer());
  return { workbook: read, rows };
}

let sample: Awaited<ReturnType<typeof readBack>>;
beforeAll(async () => {
  sample = await readBack(1);
});

const TAB_NAMES: Record<Category, string> = { CARE_LEAVER: CARE_LEAVER_TAB, CHILD_AT_RISK: CHILD_AT_RISK_TAB };
const tab = (category: Category) => sample.workbook.getWorksheet(TAB_NAMES[category])!;
const rowsOf = (category: Category) => sample.rows.filter((row) => row.category === category);

/** Where each tab keeps a person's details. The children's tab has no serial number header. */
const COLUMNS = {
  CARE_LEAVER: { serial: 1, childName: null, name: 2, nic: 3, phone: 5, district: 6, office: 7, last: 16 },
  CHILD_AT_RISK: { serial: 1, childName: 2, name: 3, nic: 4, phone: 6, district: 7, office: 8, last: 17 },
} as const;

function headerRow(sheet: ExcelJS.Worksheet, row: number, columns: number) {
  return Array.from({ length: columns }, (_, i) => {
    const cell = sheet.getCell(row, i + 1);
    return cell.isMerged && cell.master.address !== cell.address ? M : cell.value;
  });
}

const tidyNic = (value: ExcelJS.CellValue) => (value === null ? null : String(value).replace(/\s/g, "").toUpperCase());
const tidyPhones = (value: ExcelJS.CellValue) =>
  value === null ? [] : typeof value === "number" ? [`0${value}`] : String(value).replaceAll("-", "").split(" ");
/** A name compared the forgiving way: no spaces, capitals or zero-width characters. */
const loose = (name: string) => name.replace(/[\s‌‍]/g, "").toLowerCase();

describe("the sample sheet", () => {
  it("has the real sheet's two tabs, in order", () => {
    expect(sample.workbook.worksheets.map((sheet) => sheet.name)).toEqual(["නිවාසගත", "අවදානම් දරුවන්"]);
  });

  it("has the care leavers' two header rows, merges and joiners as in the real sheet", () => {
    const sheet = tab("CARE_LEAVER");
    expect([...sheet.model.merges].sort()).toEqual([
      "A1:A2",
      "B1:B2",
      "C1:C2",
      "D1:D2",
      "E1:E2",
      "G1:G2",
      "H1:K1",
      "L1:O1",
      "P1:P2",
    ]);
    // The phone numbers' column has no header, and the district's header is on row 2 only.
    expect(headerRow(sheet, 1, 16)).toEqual([
      "අනු අංකය",
      "නම",
      "ජාතික හැඳුනුම්පත් අංකය",
      "ලිපිනය",
      null,
      null,
      `ප්${ZWJ}රා.ලේ. කොට්ඨාසය`,
      `මූල්${ZWJ}ය ප්${ZWJ}රගතිය (රු)`,
      M,
      M,
      M,
      `භෞතික ප්${ZWJ}රගතිය`,
      M,
      M,
      M,
      "Remark",
    ]);
    expect(headerRow(sheet, 2, 16)).toEqual([
      M,
      M,
      M,
      M,
      M,
      `දිස්ත්${ZWJ}රික්කය`,
      M,
      "පළමු වාරිකය",
      "දෙවන වාරිකය",
      "තුන්වන වාරිකය",
      "සිව්වන වාරිකය",
      "Foundation Level",
      "Wall Level",
      "Roof Level",
      "Completed",
      M,
    ]);
  });

  it("has the children's two header rows, merges and joiners as in the real sheet", () => {
    const sheet = tab("CHILD_AT_RISK");
    expect([...sheet.model.merges].sort()).toEqual([
      "A1:A2",
      "B1:B2",
      "C1:C2",
      "D1:D2",
      "E1:E2",
      "F1:F2",
      "G1:G2",
      "H1:H2",
      "I1:L1",
      "M1:P1",
      "Q1:Q2",
    ]);
    // The serial numbers' column has no header, and the DS office's header differs from the other tab's.
    expect(headerRow(sheet, 1, 17)).toEqual([
      null,
      "දරුවාගේ නම",
      "භාරකරුගේ නම",
      "භාරකරුගේ ජාතික හැඳුනුම්පත් අංකය",
      "ලිපිනය",
      "දුරකතන අංකය",
      `දිස්ත්${ZWJ}රික්කය`,
      `ප්${ZWJ}රා.ලේ. කාර්යාලය`,
      `මූල්${ZWJ}ය ප්${ZWJ}රගතිය (රු)`,
      M,
      M,
      M,
      `භෞතික ප්${ZWJ}රගතිය`,
      M,
      M,
      M,
      "Remark",
    ]);
    expect(headerRow(sheet, 2, 17).slice(8, 16)).toEqual([
      "පළමු වාරිකය",
      "දෙවන වාරිකය",
      "තුන්වන වාරිකය",
      "සිව්වන වාරිකය",
      "Foundation Level",
      "Wall Level",
      "Roof Level",
      "Completed",
    ]);
  });

  it("keeps both header rows in view", () => {
    for (const sheet of sample.workbook.worksheets)
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2, topLeftCell: "A3" });
  });

  it("has 240 care leavers and 504 children, each with a row in the answer key", () => {
    for (const [category, people] of [
      ["CARE_LEAVER", 240],
      ["CHILD_AT_RISK", 504],
    ] as const) {
      const rows = rowsOf(category);
      expect(rows.filter((row) => !row.quirks.includes("emptyRow"))).toHaveLength(people);
      expect(rows.map((row) => row.row)).toEqual(rows.map((_, i) => i + 3));
      expect(tab(category).rowCount).toBe(rows.length + 2);
    }
  });

  it("agrees with its answer key, cell by cell", () => {
    for (const row of sample.rows) {
      const columns = COLUMNS[row.category];
      const cells = tab(row.category).getRow(row.row);
      const value = (column: number) => cells.getCell(column).value;

      if (row.quirks.includes("emptyRow")) {
        for (let column = 1; column <= columns.last; column++) expect(value(column)).toBeNull();
        continue;
      }
      expect(value(columns.serial)).toBe(row.serial);
      expect(value(columns.name)).toBe(row.name);
      if (columns.childName) expect(value(columns.childName)).toBe(row.childName);

      const nic = value(columns.nic);
      if (row.quirks.includes("badNic")) expect([nic !== null, row.nic]).toEqual([true, null]);
      else expect(tidyNic(nic)).toBe(row.nic);

      const phones = tidyPhones(value(columns.phone));
      if (row.quirks.includes("badPhone")) expect([phones[0].length, row.phones]).toEqual([9, []]);
      else expect(phones).toEqual(row.phones);
    }
  });

  it("names each row's district and DS office the way its answer key says", () => {
    const district = (nameEn: string) => places.districts.find((d) => d.nameEn === nameEn)!;
    const unplaced: Quirk[] = ["noDistrict", "unknownDistrict", "noOffice", "unknownOffice", "officeInOtherDistrict"];

    for (const row of sample.rows.filter((r) => !r.quirks.includes("emptyRow"))) {
      const columns = COLUMNS[row.category];
      const cells = tab(row.category).getRow(row.row);
      const districtCell = cells.getCell(columns.district).value as string | null;
      const officeCell = cells.getCell(columns.office).value as string | null;

      if (row.district) {
        const { nameSi, nameEn } = district(row.district);
        if (row.quirks.includes("englishDistrict")) expect(districtCell).toBe(nameEn);
        else if (row.quirks.includes("districtSpelling")) expect([nameSi, nameEn]).not.toContain(districtCell);
        else expect(districtCell).toBe(nameSi);
      }

      const inDistrict = places.dsOffices.filter((o) => o.district === row.district);
      const matches = (o: (typeof places.dsOffices)[number]) =>
        officeCell !== null && [o.nameSi, o.nameEn].some((name) => loose(name) === loose(officeCell));
      if (row.quirks.some((quirk) => unplaced.includes(quirk))) {
        expect(row.officeCode).toBeNull();
        // The import must not be able to place it, even comparing names the forgiving way.
        if (row.district) expect(inDistrict.filter(matches)).toEqual([]);
        if (row.quirks.includes("officeInOtherDistrict")) expect(places.dsOffices.some(matches)).toBe(true);
        continue;
      }
      const office = places.dsOffices.find((o) => o.code === row.officeCode)!;
      expect(office.district).toBe(row.district);
      expect(inDistrict.filter(matches)).toEqual([office]);
      if (row.quirks.includes("englishOffice")) expect(officeCell).toBe(office.nameEn);
      else if (row.quirks.includes("officeSpelling")) expect([office.nameSi, office.nameEn]).not.toContain(officeCell);
      else expect(officeCell).toBe(office.nameSi);
    }
  });

  it("mixes district spellings as the real sheet does", () => {
    const written = new Set(
      sample.rows.map((row) => tab(row.category).getRow(row.row).getCell(COLUMNS[row.category].district).value),
    );
    for (const spelling of ["Jaffna", "Mullative", "අනුරාධපුර", `ත්${ZWJ}රීකුණාමලය`, "රත්නපුර", "මොනරාගල", "කොළඹ"])
      expect(written).toContain(spelling);
    // Most rows still use the list's own Sinhala name.
    const plain = sample.rows.filter(
      (row) => !row.quirks.some((q) => ["englishDistrict", "districtSpelling", "emptyRow"].includes(q)),
    );
    expect(plain.length).toBeGreaterThan(sample.rows.length / 2);
  });

  it("has every quirk at least once", () => {
    const seen = new Set(sample.rows.flatMap((row) => row.quirks));
    expect(Object.keys(QUIRKS).filter((quirk) => !seen.has(quirk as Quirk))).toEqual([]);
  });

  it("keeps the numbers Excel holds as numbers", () => {
    const valueAt = (row: (typeof sample.rows)[number], column: "nic" | "phone") =>
      tab(row.category).getRow(row.row).getCell(COLUMNS[row.category][column]).value;
    for (const row of sample.rows.filter((r) => r.quirks.includes("nicAsNumber")))
      expect(String(valueAt(row, "nic"))).toMatch(/^\d{12}$/);
    for (const row of sample.rows.filter((r) => r.quirks.includes("phoneAsNumber")))
      expect(String(valueAt(row, "phone"))).toMatch(/^7\d{8}$/);
  });

  it("repeats one care leaver's serial number and leaves a block of children without one", () => {
    const careLeavers = rowsOf("CARE_LEAVER");
    const repeated = careLeavers.filter((row) => row.quirks.includes("repeatedSerial"));
    expect(repeated).toHaveLength(1);
    expect(repeated[0].serial).toBe(careLeavers[careLeavers.indexOf(repeated[0]) - 1].serial);

    const unnumbered = rowsOf("CHILD_AT_RISK").filter((row) => row.quirks.includes("noSerial"));
    expect(unnumbered.length).toBeGreaterThan(1);
    expect(unnumbered.map((row) => row.row)).toEqual(unnumbered.map((_, i) => unnumbered[0].row + i));
    expect(new Set(unnumbered.map((row) => row.officeCode)).size).toBe(1);
  });

  it("gives the same sheet for the same seed, and other people for another", async () => {
    expect(makeSampleSheet(1).rows).toEqual(sample.rows);
    const other = makeSampleSheet(2).rows;
    expect(other.map((row) => row.name)).not.toEqual(sample.rows.map((row) => row.name));
  });
});
