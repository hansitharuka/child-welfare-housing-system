/**
 * Imports the Ministry's progress sheet, "ප්‍රගතිය - දිවියට සවියක්.xlsx" (IMP-1). Its rows become
 * IMPORTED cases, which Head Office then confirms one by one (IMP-5).
 *
 *   npm run sheet:import -- <file.xlsx>                      imports it into the database in DATABASE_URL
 *   npm run sheet:import -- <file.xlsx> --dry-run            reads and checks it, and writes nothing
 *   npm run sheet:import -- <file.xlsx> --report <file.csv>  writes the report somewhere else
 *
 * Every run, dry or not, writes a report of the rows not imported and the imported rows to check
 * (IMP-6): a CSV file next to the sheet, named after it and the time, with each row's tab, number and
 * reason only. Running it again adds only the rows that weren't imported before (IMP-7), for example
 * after a missing DS office has been added to the list. The real sheet holds real people's details:
 * import it on the production server only (Phase 9), never on a development machine, and never put it
 * or its report in the repository. Use `npm run sheet:sample` to try the import.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Category } from "../src/generated/prisma/enums";
import { colomboDay } from "../src/lib/dates";
import { createPrismaClient } from "../src/server/db";
import {
  type AttentionReason,
  type ImportIssue,
  type ImportResult,
  importSheet,
  type SkipReason,
} from "../src/server/import/commands";
import { SheetLayoutError, TABS } from "../src/server/import/sheet";

const SKIPPED: Record<SkipReason, string> = {
  noDistrict: "no district",
  unknownDistrict: "a district that is not on the list",
  noOffice: "no DS office",
  unknownOffice: "no DS office of that name in the district",
  officeInOtherDistrict: "the name of a DS office in another district",
  officeInactive: "a DS office that is inactive",
  noName: "no name",
};

const ATTENTION: Record<AttentionReason, string> = {
  noSerial: "no serial number, so a later import finds it by its row number",
  repeatedSerial: "a serial number used above it, so a later import finds it by its row number",
  badNic: "a NIC that is not valid, kept in the sheet notes only",
  badPhone: "a phone number that is not valid, kept in the sheet notes only",
  tooManyPhones: "more than two phone numbers; the others are in the sheet notes",
  noChildName: "no child's name",
  noGuardianName: "no guardian's name",
};

function counts<R extends string>(issues: ImportIssue<R>[], text: Record<R, string>): string[] {
  const byReason = new Map<R, number>();
  for (const { reason } of issues) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  return [...byReason].map(([reason, count]) => `  ${String(count).padStart(4)}  ${text[reason]}`);
}

function summary(result: ImportResult): string {
  const { CARE_LEAVER: care, CHILD_AT_RISK: atRisk } = result.created;
  return [
    `${result.dryRun ? "Would import" : "Imported"} ${care + atRisk} cases: ${care} care leavers and ${atRisk} children at risk.`,
    `${result.alreadyImported} rows were imported before, and ${result.emptyRows} rows are empty.`,
    `${result.skipped.length} rows not imported:`,
    ...counts(result.skipped, SKIPPED),
    `${result.attention.length} things to check on imported rows:`,
    ...counts(result.attention, ATTENTION),
    ...(result.dryRun ? ["Nothing was written to the database (--dry-run)."] : []),
  ].join("\n");
}

// --- The report (IMP-6) ---------------------------------------------------------------------------

const TAB_NAMES = Object.fromEntries(TABS.map((tab) => [tab.category, tab.name])) as Record<Category, string>;
const tabOrder = (category: Category) => TABS.findIndex((tab) => tab.category === category);

/**
 * One CSV cell. A place name as the sheet wrote it can't turn into a formula when Excel opens the
 * report: one starting with =, +, - or @ gets a ' in front.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The report: one line per row and reason, the rows not imported first, then the imported rows to
 * check, each in the sheet's order. A line holds the tab, the row number and the reason, plus the
 * district and DS office as written for a row that couldn't be placed, so the list or the sheet can be
 * fixed. Nothing else about the person (IMP-6). It starts with a byte-order mark, so Excel reads the
 * Sinhala as Sinhala.
 */
export function reportCsv(result: ImportResult): string {
  const inSheetOrder = <R>(issues: ImportIssue<R>[]) =>
    issues.toSorted((a, b) => tabOrder(a.category) - tabOrder(b.category) || a.row - b.row);
  const lines = [
    ["Tab", "Row", "Imported", "Reason", "District in the sheet", "DS office in the sheet"],
    ...inSheetOrder(result.skipped).map((issue) => [
      TAB_NAMES[issue.category],
      issue.row,
      "no",
      SKIPPED[issue.reason],
      issue.written?.district,
      issue.written?.office,
    ]),
    ...inSheetOrder(result.attention).map((issue) => [
      TAB_NAMES[issue.category],
      issue.row,
      "yes",
      ATTENTION[issue.reason],
      null,
      null,
    ]),
  ];
  return `﻿${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`;
}

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Where the report goes unless --report says otherwise: next to the sheet, which is kept outside the
 * repository (IMP-6), named after it and the time in Colombo, for example
 * "sample-sheet-import-report-2026-10-05-143012-dry-run.csv".
 */
export function reportPath(sheet: string, { now, dryRun }: { now: Date; dryRun: boolean }): string {
  const time = Object.fromEntries(clock.formatToParts(now).map((part) => [part.type, part.value]));
  const stamp = `${colomboDay(now)}-${time.hour}${time.minute}${time.second}`;
  const name = `${basename(sheet, extname(sheet))}-import-report-${stamp}${dryRun ? "-dry-run" : ""}.csv`;
  return join(dirname(sheet), name);
}

/** The report can't be written where it should go. Nothing has been imported. */
export class ReportError extends Error {
  name = "ReportError";
}

export type RunOptions = {
  dryRun?: boolean;
  /** Where to write the report, instead of next to the sheet. */
  report?: string;
  now?: Date;
};

/**
 * Imports the sheet and writes its report. The report file is made before the import, so a place it
 * can't be written stops the run before anything is imported; a later run wouldn't list the imported
 * rows to check again. An earlier report is never written over.
 */
export async function runImport(
  db: PrismaClient,
  file: string,
  { dryRun = false, report, now = new Date() }: RunOptions = {},
): Promise<{ result: ImportResult; report: string }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const reportFile = resolve(report ?? reportPath(file, { now, dryRun }));
  const handle = await open(reportFile, "wx").catch((error: NodeJS.ErrnoException) => {
    throw new ReportError(
      error.code === "EEXIST"
        ? `There is a report at ${reportFile} already.`
        : `The report can't be written at ${reportFile} (${error.code}).`,
    );
  });

  let result: ImportResult;
  try {
    result = await importSheet(db, workbook, { dryRun, file: basename(file), now });
  } catch (error) {
    // A run that fails imports nothing (IMP-1), so there is nothing to report.
    await handle.close();
    await rm(reportFile);
    throw error;
  }
  try {
    await handle.writeFile(reportCsv(result));
  } finally {
    await handle.close();
  }
  return { result, report: reportFile };
}

/** The sheet's path and the options, or null when they don't make sense. */
function readArgs(): { path: string; dryRun: boolean; report?: string } | null {
  try {
    const { values, positionals } = parseArgs({
      options: { "dry-run": { type: "boolean" }, report: { type: "string" } },
      allowPositionals: true,
    });
    if (positionals.length !== 1) return null;
    return { path: positionals[0], dryRun: values["dry-run"] ?? false, report: values.report };
  } catch {
    return null;
  }
}

// Run directly: npx tsx scripts/import-sheet.ts <file.xlsx> [--dry-run] [--report file.csv]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = readArgs();
  if (!args) {
    console.error("Usage: npm run sheet:import -- <file.xlsx> [--dry-run] [--report <file.csv>]");
    process.exit(1);
  }
  const file = resolve(args.path);
  if (!existsSync(file)) {
    console.error(`No file at ${file}.`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const prisma = createPrismaClient(databaseUrl);
  runImport(prisma, file, { dryRun: args.dryRun, report: args.report })
    .then(({ result, report }) => {
      const lines = result.skipped.length + result.attention.length;
      console.log(`${summary(result)}\nThe report, ${lines} lines, is at ${report}.`);
    })
    .catch((error: unknown) => {
      // A layout or report problem is the sheet's or the folder's, not the script's: say what is
      // wrong, without a stack trace.
      const known = error instanceof SheetLayoutError || error instanceof ReportError;
      console.error(known ? `${error.message} Nothing was imported.` : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
