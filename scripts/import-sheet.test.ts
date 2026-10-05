import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImportResult } from "../src/server/import/commands";
import { reportCsv, reportPath } from "./import-sheet";

/** The report read back the way Excel reads a CSV file: quoted cells, "" for a quote, CRLF between lines. */
function parse(csv: string): string[][] {
  const lines: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted && char === '"' && csv[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      lines.at(-1)!.push(cell);
      cell = "";
    } else if (!quoted && char === "\r" && csv[i + 1] === "\n") {
      lines.at(-1)!.push(cell);
      cell = "";
      lines.push([]);
      i++;
    } else {
      cell += char;
    }
  }
  expect(lines.pop()).toEqual([]);
  return lines;
}

const result: ImportResult = {
  dryRun: false,
  created: { CARE_LEAVER: 3, CHILD_AT_RISK: 2 },
  alreadyImported: 0,
  emptyRows: 1,
  skipped: [
    {
      category: "CHILD_AT_RISK",
      row: 7,
      reason: "unknownOffice",
      written: { district: "කොළඹ", office: '=HYPERLINK("x")' },
    },
    { category: "CARE_LEAVER", row: 12, reason: "noName" },
    { category: "CARE_LEAVER", row: 5, reason: "noDistrict", written: { district: null, office: "Homagama, west" } },
  ],
  attention: [
    { category: "CHILD_AT_RISK", row: 4, reason: "noSerial" },
    { category: "CARE_LEAVER", row: 9, reason: "badNic" },
    { category: "CARE_LEAVER", row: 9, reason: "badPhone" },
  ],
};

describe("the import's report (IMP-6)", () => {
  it("lists the rows not imported, then the imported rows to check, each in the sheet's order", () => {
    expect(parse(reportCsv(result).slice(1))).toEqual([
      ["Tab", "Row", "Imported", "Reason", "District in the sheet", "DS office in the sheet"],
      ["නිවාසගත", "5", "no", "no district", "", "Homagama, west"],
      ["නිවාසගත", "12", "no", "no name", "", ""],
      ["අවදානම් දරුවන්", "7", "no", "no DS office of that name in the district", "කොළඹ", `'=HYPERLINK("x")`],
      ["නිවාසගත", "9", "yes", "a NIC that is not valid, kept in the sheet notes only", "", ""],
      ["නිවාසගත", "9", "yes", "a phone number that is not valid, kept in the sheet notes only", "", ""],
      ["අවදානම් දරුවන්", "4", "yes", "no serial number, so a later import finds it by its row number", "", ""],
    ]);
  });

  it("is a CSV file that Excel opens as Sinhala, quoting cells with commas and quotes", () => {
    const csv = reportCsv(result);
    expect(csv.startsWith("﻿Tab,Row,")).toBe(true);
    expect(csv).toContain('"Homagama, west"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("has only its header when nothing needs a look", () => {
    expect(parse(reportCsv({ ...result, skipped: [], attention: [] }).slice(1))).toHaveLength(1);
  });

  it("goes next to the sheet, named after it and the time in Colombo", () => {
    const sheet = join("imports", "sample-sheet.xlsx");
    const now = new Date("2026-10-05T09:00:12Z");
    expect(reportPath(sheet, { now, dryRun: false })).toBe(
      join("imports", "sample-sheet-import-report-2026-10-05-143012.csv"),
    );
    expect(reportPath(sheet, { now, dryRun: true })).toBe(
      join("imports", "sample-sheet-import-report-2026-10-05-143012-dry-run.csv"),
    );
    // 18:30 UTC is just after midnight in Colombo, on the next day.
    expect(reportPath(sheet, { now: new Date("2026-10-05T18:30:05Z"), dryRun: false })).toBe(
      join("imports", "sample-sheet-import-report-2026-10-06-000005.csv"),
    );
  });
});
