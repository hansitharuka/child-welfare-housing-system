/**
 * Imports the Ministry's progress sheet, "ප්‍රගතිය - දිවියට සවියක්.xlsx" (IMP-1). Its rows become
 * IMPORTED cases, which Head Office then confirms one by one (IMP-5).
 *
 *   npm run sheet:import -- <file.xlsx>             imports it into the database in DATABASE_URL
 *   npm run sheet:import -- <file.xlsx> --dry-run   reads and checks it, and writes nothing
 *
 * Running it again adds only the rows that weren't imported before (IMP-7), for example after a
 * missing DS office has been added to the list. The real sheet holds real people's details: import it
 * on the production server only (Phase 9), never on a development machine, and never put it in the
 * repository. Use `npm run sheet:sample` to try the import.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { createPrismaClient } from "../src/server/db";
import {
  type AttentionReason,
  type ImportIssue,
  type ImportResult,
  importSheet,
  type SkipReason,
} from "../src/server/import/commands";
import { SheetLayoutError } from "../src/server/import/sheet";

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
    ...(result.dryRun ? ["Nothing was written (--dry-run)."] : []),
  ].join("\n");
}

// Run directly: npx tsx scripts/import-sheet.ts <file.xlsx> [--dry-run]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const path = args.find((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!path) {
    console.error("Usage: npm run sheet:import -- <file.xlsx> [--dry-run]");
    process.exit(1);
  }
  const file = resolve(path);
  if (!existsSync(file)) {
    console.error(`No file at ${file}.`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const prisma = createPrismaClient(databaseUrl);
  const run = async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    console.log(summary(await importSheet(prisma, workbook, { dryRun, file: basename(file) })));
  };
  run()
    .catch((error: unknown) => {
      // A layout problem is the sheet's, not the script's: say what is missing, without a stack trace.
      console.error(error instanceof SheetLayoutError ? `${error.message} Nothing was imported.` : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
