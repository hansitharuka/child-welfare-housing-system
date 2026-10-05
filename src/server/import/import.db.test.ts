import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSampleSheet, type SampleRow } from "../../../scripts/make-sample-sheet";
import { seed } from "../../../prisma/seed-data";
import { createTestClient } from "../../../tests/db/client";
import { importSheet, SHEET_IMPORT_USER_ID, type SheetNotes } from "./commands";

const db = createTestClient();
/** The cases the import makes: their keys start with the tab's category (IMP-7). Other test files' cases from the sheet use keys of their own. */
const imported = { OR: ["CARE_LEAVER:", "CHILD_AT_RISK:"].map((prefix) => ({ sheetKey: { startsWith: prefix } })) };

let workbook: ExcelJS.Workbook;
let key: SampleRow[];
/** The rows the import should bring in: those with a DS office and a name. */
let expected: SampleRow[];
/** The DS office with the most rows, which is inactive during the first import, and its rows. */
let inactive: { code: string; rows: SampleRow[] };

beforeAll(async () => {
  await seed(db);
  const sample = makeSampleSheet(1);
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await sample.workbook.xlsx.writeBuffer());
  key = sample.rows;
  expected = key.filter((k) => k.officeCode && (k.name || k.childName));

  const byOffice = Map.groupBy(expected, (k) => k.officeCode!);
  const [code, rows] = [...byOffice].sort((a, b) => b[1].length - a[1].length)[0];
  inactive = { code, rows };
  // Every row of that office has a name, so the rows it skips are exactly the ones it later brings in.
  expect(key.filter((k) => k.officeCode === code)).toHaveLength(rows.length);
});

afterAll(async () => {
  // The audit records stay (HIS-3); the cases go, so the other test files don't see them.
  await db.case.deleteMany({ where: imported });
  await db.dsOffice.update({ where: { code: inactive.code }, data: { active: true } });
  await db.$disconnect();
});

const rowOf = (c: { category: string | null; sheetRow: number | null }) =>
  key.find((k) => k.category === c.category && k.row === c.sheetRow)!;

describe("importing the sheet (AC-19)", () => {
  it("writes nothing on a dry run", async () => {
    const result = await importSheet(db, workbook, { dryRun: true });
    expect(result.created.CARE_LEAVER + result.created.CHILD_AT_RISK).toBe(expected.length);
    expect(await db.case.count({ where: imported })).toBe(0);
  });

  it("makes an IMPORTED case for each row with a DS office, and reports the rest", async () => {
    await db.dsOffice.update({ where: { code: inactive.code }, data: { active: false } });
    const audits = await db.auditLog.count({ where: { action: "sheet_imported" } });

    const result = await importSheet(db, workbook, { file: "sample.xlsx" });

    const cases = await db.case.findMany({ where: imported, include: { dsOffice: { select: { code: true } } } });
    const coming = expected.filter((k) => k.officeCode !== inactive.code);
    expect(cases).toHaveLength(coming.length);
    expect(result.created.CARE_LEAVER + result.created.CHILD_AT_RISK).toBe(coming.length);
    for (const c of cases) {
      const k = rowOf(c);
      expect(c).toMatchObject({
        status: "IMPORTED",
        kind: null,
        caseNumber: null,
        name: k.name,
        childName: k.childName,
        nic: k.nic,
        mobile1: k.phones[0] ?? null,
        mobile2: k.phones[1] ?? null,
        createdById: SHEET_IMPORT_USER_ID,
        sheetSerial: k.serial,
      });
      expect(c.dsOffice.code).toBe(k.officeCode);
    }
    // English and other spellings of districts are mapped (IMP-3).
    const quirky = cases.map(rowOf).flatMap((k) => k.quirks);
    expect(quirky).toContain("englishDistrict");
    expect(quirky).toContain("districtSpelling");
    expect(quirky).toContain("englishOffice");

    // Unknown DS offices are reported by tab and row, with the place as written (IMP-6).
    const unknown = key.filter((k) => k.quirks.includes("unknownOffice"));
    expect(unknown.length).toBeGreaterThan(0);
    for (const k of unknown) {
      expect(result.skipped).toContainEqual(
        expect.objectContaining({ category: k.category, row: k.row, reason: "unknownOffice" }),
      );
    }
    const skippedInactive = result.skipped.filter((s) => s.reason === "officeInactive");
    expect(skippedInactive.map((s) => s.row).sort()).toEqual(inactive.rows.map((k) => k.row).sort());
    // Nothing personal in the report: only where the row is, why, and the place as written.
    const fields = new Set(result.skipped.flatMap((s) => Object.keys(s)));
    expect([...fields].sort()).toEqual(["category", "reason", "row", "written"]);

    // HIS-1: one record per case by the system, and one for the run.
    const records = await db.auditLog.findMany({
      where: { action: "case_imported", caseId: { in: cases.map((c) => c.id) } },
    });
    expect(records).toHaveLength(cases.length);
    expect(records.every((r) => r.actorId === null)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "sheet_imported" } })).toBe(audits + 1);
  });

  it("makes no duplicates when run again (IMP-7)", async () => {
    const before = await db.case.count({ where: imported });
    const audits = await db.auditLog.count({ where: { action: "sheet_imported" } });

    const result = await importSheet(db, workbook);

    expect(result.created).toEqual({ CARE_LEAVER: 0, CHILD_AT_RISK: 0 });
    expect(result.alreadyImported).toBe(before);
    expect(result.attention).toEqual([]);
    expect(await db.case.count({ where: imported })).toBe(before);
    expect(await db.auditLog.count({ where: { action: "sheet_imported" } })).toBe(audits);
  });

  it("brings in only the rows that couldn't come before, once their DS office is active", async () => {
    await db.dsOffice.update({ where: { code: inactive.code }, data: { active: true } });

    const result = await importSheet(db, workbook);

    expect(result.created.CARE_LEAVER + result.created.CHILD_AT_RISK).toBe(inactive.rows.length);
    expect(result.alreadyImported).toBe(expected.length - inactive.rows.length);
    expect(result.skipped.some((s) => s.reason === "officeInactive")).toBe(false);
    expect(await db.case.count({ where: imported })).toBe(expected.length);
    const keys = await db.case.findMany({ where: imported, select: { sheetKey: true } });
    expect(new Set(keys.map((c) => c.sheetKey)).size).toBe(expected.length);
  });

  it("keeps the sheet's notes read-only, with any NIC or phone cell it couldn't store (IMP-5)", async () => {
    const cases = await db.case.findMany({ where: imported });
    const notesOf = (quirk: string) =>
      cases.filter((c) => rowOf(c).quirks.includes(quirk as never)).map((c) => c.sheetNotes as SheetNotes | null);

    expect(notesOf("multilineNote").map((n) => n?.installments[0])).toEqual(["නිදහස් කර නැත"]);
    expect(notesOf("numberRemark").map((n) => n?.remark)).toEqual(["2"]);
    const badNic = notesOf("badNic");
    expect(badNic.length).toBeGreaterThan(0);
    for (const notes of badNic) expect(notes?.nic).toBeTruthy();
    for (const notes of [...notesOf("badPhone"), ...notesOf("threePhones")]) expect(notes?.phone).toBeTruthy();
    // A row with no notes and nothing left out keeps none.
    expect(cases.some((c) => c.sheetNotes === null)).toBe(true);
  });
});
