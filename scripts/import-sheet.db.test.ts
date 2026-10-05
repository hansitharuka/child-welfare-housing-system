import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../prisma/seed-data";
import { SheetLayoutError } from "../src/server/import/sheet";
import { createTestClient } from "../tests/db/client";
import { ReportError, reportCsv, reportPath, runImport } from "./import-sheet";
import { CARE_LEAVER_TAB, CHILD_AT_RISK_TAB, makeSampleSheet, type SampleRow } from "./make-sample-sheet";

const db = createTestClient();
const imported = { sheetKey: { not: null } };
const now = new Date("2026-10-05T09:00:12Z");

let folder: string;
let sheet: string;
let key: SampleRow[];

beforeAll(async () => {
  await seed(db);
  folder = await mkdtemp(join(tmpdir(), "import-report-"));
  sheet = join(folder, "sample-sheet.xlsx");
  const sample = makeSampleSheet(1);
  await sample.workbook.xlsx.writeFile(sheet);
  key = sample.rows;
});

afterAll(async () => {
  // Nothing here should import a case; if something did, the other test files mustn't see it.
  await db.case.deleteMany({ where: imported });
  await rm(folder, { recursive: true, force: true });
  await db.$disconnect();
});

describe("the import's report file (IMP-6)", () => {
  it("is written next to the sheet, with a line for each row not imported or to check", async () => {
    const { result, report } = await runImport(db, sheet, { dryRun: true, now });

    expect(report).toBe(reportPath(sheet, { now, dryRun: true }));
    const text = await readFile(report, "utf8");
    expect(text).toBe(reportCsv(result));
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.attention.length).toBeGreaterThan(0);
    expect(text.split("\r\n").slice(1, -1)).toHaveLength(result.skipped.length + result.attention.length);

    // Each unknown DS office is in it by tab and row (AC-19).
    const tabs = { CARE_LEAVER: CARE_LEAVER_TAB, CHILD_AT_RISK: CHILD_AT_RISK_TAB };
    const unknown = key.filter((k) => k.quirks.includes("unknownOffice"));
    expect(unknown.length).toBeGreaterThan(0);
    for (const k of unknown) {
      expect(text).toContain(`\r\n${tabs[k.category]},${k.row},no,no DS office of that name in the district,`);
    }
    // No names, NICs or phone numbers.
    const personal = key.flatMap((k) => [k.name, k.childName, k.nic, ...k.phones]).filter((value) => value !== null);
    expect(personal.length).toBeGreaterThan(0);
    for (const value of personal) expect(text).not.toContain(value);
  });

  it("goes where --report says, and only into a folder that exists", async () => {
    const elsewhere = join(folder, "elsewhere.csv");
    const { report } = await runImport(db, sheet, { dryRun: true, report: elsewhere, now });
    expect(report).toBe(elsewhere);
    expect((await readFile(elsewhere, "utf8")).startsWith("﻿Tab,Row,")).toBe(true);

    await expect(
      runImport(db, sheet, { dryRun: true, report: join(folder, "missing", "report.csv"), now }),
    ).rejects.toThrow(ReportError);
  });

  it("never writes over an earlier report, and then imports nothing", async () => {
    const earlier = reportPath(sheet, { now, dryRun: false });
    await writeFile(earlier, "an earlier report");
    const before = await db.case.count({ where: imported });

    await expect(runImport(db, sheet, { now })).rejects.toThrow(ReportError);

    expect(await readFile(earlier, "utf8")).toBe("an earlier report");
    expect(await db.case.count({ where: imported })).toBe(before);
  });

  it("is removed again when the import fails, which imports nothing", async () => {
    const broken = join(folder, "broken.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1");
    await workbook.xlsx.writeFile(broken);

    await expect(runImport(db, broken, { now })).rejects.toThrow(SheetLayoutError);

    expect((await readdir(folder)).filter((name) => name.startsWith("broken"))).toEqual(["broken.xlsx"]);
  });
});
