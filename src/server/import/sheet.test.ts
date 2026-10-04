import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import places from "../../../data/places.json";
import { makeSampleSheet, type SampleRow } from "../../../scripts/make-sample-sheet";
import { type PlaceList, placer } from "./places";
import { readSheet, type SheetRow, SheetLayoutError, squash } from "./sheet";
import { readNic, readPhones } from "./values";

const ZWJ = "‍";
const ZWNJ = "‌";

/** The sample as the import sees it: written to a file and read back. */
async function readBack(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await workbook.xlsx.writeBuffer());
  return read;
}

/** The place list from data/places.json, as the database holds it after the seed. */
const LIST: PlaceList = {
  districts: places.districts.map((d, i) => ({ id: i + 1, nameEn: d.nameEn, nameSi: d.nameSi })),
  offices: places.dsOffices.map((o, i) => ({
    id: i + 1,
    code: o.code,
    nameEn: o.nameEn,
    nameSi: o.nameSi,
    districtId: places.districts.findIndex((d) => d.nameEn === o.district) + 1,
    active: true,
  })),
};

let key: SampleRow[];
let rows: SheetRow[];
let emptyRows: number;
/** The answer key's row for a row read from the sheet. */
const answer = (row: SheetRow) => key.find((k) => k.category === row.category && k.row === row.row)!;

beforeAll(async () => {
  const sample = makeSampleSheet(1);
  key = sample.rows;
  ({ rows, emptyRows } = readSheet(await readBack(sample.workbook)));
});

describe("squash", () => {
  it("ignores spaces, capitals and zero-width characters", () => {
    expect(squash(` ප්${ZWJ}රා.ලේ.  කොට්ඨාසය `)).toBe(squash("ප්රා.ලේ.කොට්ඨාසය"));
    expect(squash(`අම්බලන්${ZWNJ}ගොඩ`)).toBe(squash("අම්බලන්ගොඩ"));
    expect(squash("KALMUNAI")).toBe("kalmunai");
  });
});

describe("reading the sheet (IMP-2)", () => {
  it("reads every row with something in it, in both tabs, and passes over the empty row", () => {
    const people = key.filter((k) => !k.quirks.includes("emptyRow"));
    expect(rows.map((r) => `${r.category}:${r.row}`)).toEqual(people.map((k) => `${k.category}:${k.row}`));
    expect(emptyRows).toBe(1);
  });

  it("finds the columns by their headers, including the two without one", () => {
    for (const row of rows) {
      const k = answer(row);
      expect(row.serial).toBe(k.serial);
      expect(row.name).toBe(k.name);
      expect(row.childName).toBe(k.childName);
    }
    // The care leavers' phone numbers have no header, and most care leavers have one.
    expect(rows.filter((r) => r.category === "CARE_LEAVER" && r.phone).length).toBeGreaterThan(150);
  });

  it("keeps the progress notes on their lines, without blank lines", () => {
    const multiline = rows.find((r) => answer(r).quirks.includes("multilineNote"))!;
    expect(multiline.installments[0]).toBe("නිදහස් කර නැත");
    const remark = rows.find((r) => answer(r).quirks.includes("numberRemark"))!;
    expect(remark.remark).toBe("2");
    expect(rows.some((r) => r.category === "CARE_LEAVER" && r.levels.some(Boolean))).toBe(true);
  });

  it("keys a row on its serial number, or on its row number when it has none or a repeated one (IMP-7)", () => {
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of rows) {
      const quirks = answer(row).quirks;
      if (quirks.includes("noSerial")) {
        expect(row).toMatchObject({ keyedOnRow: "noSerial", key: `${row.category}:row:${row.row}` });
      } else if (quirks.includes("repeatedSerial")) {
        expect(row).toMatchObject({ keyedOnRow: "repeatedSerial", key: `${row.category}:row:${row.row}` });
      } else {
        expect(row).toMatchObject({ keyedOnRow: null, key: `${row.category}:serial:${row.serial}` });
      }
    }
    expect(rows.filter((r) => r.keyedOnRow === "noSerial").length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.keyedOnRow === "repeatedSerial")).toHaveLength(1);
  });

  it("stops when a tab or a column is missing, naming it", async () => {
    const noTab = new ExcelJS.Workbook();
    noTab.addWorksheet("නිවාසගත");
    expect(() => readSheet(noTab)).toThrow(SheetLayoutError);

    const workbook = await readBack(makeSampleSheet(1).workbook);
    workbook.getWorksheet("අවදානම් දරුවන්")!.getCell("C1").value = "නම";
    expect(() => readSheet(workbook)).toThrow(/no column headed "භාරකරුගේ නම"/);
  });

  it("finds headers typed with other spacing or without zero-width joiners", async () => {
    const workbook = await readBack(makeSampleSheet(1).workbook);
    const sheet = workbook.getWorksheet("නිවාසගත")!;
    sheet.getCell("G1").value = "ප්රා.ලේ.කොට්ඨාසය ";
    sheet.getCell("F2").value = "දිස්ත්රික්කය";
    expect(readSheet(workbook).rows).toHaveLength(rows.length);
  });
});

describe("NICs and phone numbers", () => {
  it("tidies each row's NIC and phone numbers as the answer key has them", () => {
    for (const row of rows) {
      const k = answer(row);
      expect(readNic(row.nic).nic, `NIC on ${row.category} row ${row.row}`).toBe(k.nic);
      expect(readPhones(row.phone).phones, `phones on ${row.category} row ${row.row}`).toEqual(k.phones.slice(0, 2));
    }
  });

  it("says when a NIC or phone number can't be stored", () => {
    expect(readNic("1990123456789")).toEqual({ nic: null, nicKey: null, problem: "badNic" });
    expect(readNic("880001234 v")).toEqual({ nic: "880001234V", nicKey: "198800001234", problem: null });
    expect(readNic("-")).toEqual({ nic: null, nicKey: null, problem: null });
    expect(readPhones("771234567")).toEqual({ phones: ["0771234567"], problem: null });
    expect(readPhones("077 123 4567")).toEqual({ phones: ["0771234567"], problem: null });
    expect(readPhones("+94771234567")).toEqual({ phones: ["0771234567"], problem: null });
    expect(readPhones("077-1234567/071-2345678")).toEqual({ phones: ["0771234567", "0712345678"], problem: null });
    expect(readPhones("077-1234567 071-2345678 011-2345678")).toEqual({
      phones: ["0771234567", "0712345678"],
      problem: "tooManyPhones",
    });
    expect(readPhones("077-123456")).toEqual({ phones: [], problem: "badPhone" });
    expect(readPhones("077-1234567 071-23456")).toEqual({ phones: ["0771234567"], problem: "badPhone" });
    expect(readPhones("නැත")).toEqual({ phones: [], problem: null });
  });
});

describe("placing rows (IMP-3)", () => {
  const place = placer(LIST);
  const codeOf = (row: SheetRow) => {
    const placed = place(row.district, row.office);
    return "code" in placed ? placed.code : null;
  };

  it("finds each row's DS office as the answer key has it", () => {
    for (const row of rows) expect(codeOf(row), `${row.category} row ${row.row}`).toBe(answer(row).officeCode);
  });

  it("accepts English and other spellings of districts", () => {
    const english = rows.filter((r) => answer(r).quirks.includes("englishDistrict") && answer(r).officeCode);
    const spelled = rows.filter((r) => answer(r).quirks.includes("districtSpelling") && answer(r).officeCode);
    expect(english.length).toBeGreaterThan(0);
    expect(spelled.length).toBeGreaterThan(0);
    for (const row of [...english, ...spelled]) expect(codeOf(row)).not.toBeNull();
  });

  it("says why a row can't be placed", () => {
    const reasons = new Map<string, string>();
    for (const row of rows) {
      const placed = place(row.district, row.office);
      if ("problem" in placed) for (const q of answer(row).quirks) reasons.set(q, placed.problem);
    }
    expect(reasons.get("noDistrict")).toBe("noDistrict");
    expect(reasons.get("unknownDistrict")).toBe("unknownDistrict");
    expect(reasons.get("noOffice")).toBe("noOffice");
    expect(reasons.get("unknownOffice")).toBe("unknownOffice");
    expect(reasons.get("officeInOtherDistrict")).toBe("officeInOtherDistrict");

    const inactive = placer({ ...LIST, offices: LIST.offices.map((o) => ({ ...o, active: o.code !== "HMG" })) });
    expect(inactive("කොළඹ", "හෝමාගම")).toEqual({ problem: "officeInactive" });
    expect(place("කොළඹ", "හෝමාගම")).toMatchObject({ code: "HMG" });
  });
});
