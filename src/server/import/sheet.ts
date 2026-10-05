import type ExcelJS from "exceljs";
import type { Category } from "@/generated/prisma/enums";

/**
 * Reads the Ministry's progress sheet (IMP-2): finds its two tabs and each tab's columns by their
 * headers, and turns every row into plain text, without judging it yet. values.ts tidies the NICs and
 * phone numbers, places.ts finds the DS office, and commands.ts decides what to import.
 */

/** Something wrong with the sheet's layout. The import stops before writing anything. */
export class SheetLayoutError extends Error {
  name = "SheetLayoutError";
}

/**
 * A header or a place name compared the forgiving way: no spaces, no zero-width characters (the
 * joiner in ප්‍ර, a stray non-joiner) and no capitals. Sinhala text typed on different keyboards may
 * also differ in how its characters are composed, so it is normalised first.
 */
export function squash(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\s​-‍⁠﻿]/g, "")
    .toLowerCase();
}

/** The columns the import reads. Every one must be found, or the import stops (nothing is dropped unseen). */
export type Field =
  | "serial"
  | "name"
  | "childName"
  | "nic"
  | "address"
  | "phone"
  | "district"
  | "office"
  | "installment1"
  | "installment2"
  | "installment3"
  | "installment4"
  | "level1"
  | "level2"
  | "level3"
  | "level4"
  | "remark";

/** A column: the headers it may have, and whether it may instead be the one column with no header. */
type Column = { field: Field; headers: string[]; orNoHeader?: true };

const SERIAL = ["අනු අංකය"];
const PHONE = ["දුරකතන අංකය", "දුරකථන අංකය"];
const DISTRICT = ["දිස්ත්‍රික්කය"];
const OFFICE = ["ප්‍රා.ලේ. කොට්ඨාසය", "ප්‍රා.ලේ. කාර්යාලය"];
/** The progress columns are the same on both tabs: their own name is on header row 2. */
const PROGRESS: Column[] = [
  { field: "installment1", headers: ["පළමු වාරිකය"] },
  { field: "installment2", headers: ["දෙවන වාරිකය"] },
  { field: "installment3", headers: ["තුන්වන වාරිකය"] },
  { field: "installment4", headers: ["සිව්වන වාරිකය"] },
  { field: "level1", headers: ["Foundation Level"] },
  { field: "level2", headers: ["Wall Level"] },
  { field: "level3", headers: ["Roof Level"] },
  { field: "level4", headers: ["Completed"] },
  { field: "remark", headers: ["Remark"] },
];

/**
 * The two tabs (IMP-2). As in the real sheet, the care leavers' phone numbers and the children's
 * serial numbers have no header, so each takes its tab's one column without a header.
 */
export const TABS: { category: Category; name: string; columns: Column[] }[] = [
  {
    category: "CARE_LEAVER",
    name: "නිවාසගත",
    columns: [
      { field: "serial", headers: SERIAL },
      { field: "name", headers: ["නම"] },
      { field: "nic", headers: ["ජාතික හැඳුනුම්පත් අංකය"] },
      { field: "address", headers: ["ලිපිනය"] },
      { field: "phone", headers: PHONE, orNoHeader: true },
      { field: "district", headers: DISTRICT },
      { field: "office", headers: OFFICE },
      ...PROGRESS,
    ],
  },
  {
    category: "CHILD_AT_RISK",
    name: "අවදානම් දරුවන්",
    columns: [
      { field: "serial", headers: SERIAL, orNoHeader: true },
      { field: "childName", headers: ["දරුවාගේ නම"] },
      { field: "name", headers: ["භාරකරුගේ නම"] },
      { field: "nic", headers: ["භාරකරුගේ ජාතික හැඳුනුම්පත් අංකය"] },
      { field: "address", headers: ["ලිපිනය"] },
      { field: "phone", headers: PHONE },
      { field: "district", headers: DISTRICT },
      { field: "office", headers: OFFICE },
      ...PROGRESS,
    ],
  },
];

/** People start on row 3, under the two header rows. */
const FIRST_ROW = 3;

/** Why a row is keyed on its row number instead of its serial number (IMP-7). */
export type RowKeyReason = "noSerial" | "repeatedSerial";

/** One row of a tab, as text. Empty cells are null. */
export type SheetRow = {
  category: Category;
  /** The row's number in its tab, as Excel shows it. */
  row: number;
  serial: number | null;
  /**
   * What finds the row again on a later import (IMP-7): the tab and serial number, or the tab and row
   * number when the row has no serial number or one already used above it.
   */
  key: string;
  keyedOnRow: RowKeyReason | null;
  /** The care leaver's name, or the guardian's on the children's tab. */
  name: string | null;
  childName: string | null;
  nic: string | null;
  address: string | null;
  phone: string | null;
  district: string | null;
  office: string | null;
  installments: (string | null)[];
  levels: (string | null)[];
  remark: string | null;
};

export type ReadSheet = {
  rows: SheetRow[];
  /** Rows with nothing in them, which are passed over. */
  emptyRows: number;
};

/** The text of a cell's value, whatever Excel stored: text, a number, rich text, a link or a formula's result. */
function valueText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("formula" in value || "sharedFormula" in value) return valueText(value.result ?? null);
  if ("text" in value) return valueText(value.text);
  return null; // an error value such as #N/A
}

/** A one-line value: spaces and line breaks run together, nothing at either end. */
function line(cell: ExcelJS.Cell): string | null {
  const text = valueText(cell.value)?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** A note keeps its line breaks, without blank lines or spaces at their ends. */
function note(cell: ExcelJS.Cell): string | null {
  const lines = (valueText(cell.value) ?? "")
    .split(/\r?\n/)
    .map((text) => text.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function serialOf(cell: ExcelJS.Cell): number | null {
  const text = line(cell);
  if (!text || !/^\d+$/.test(text)) return null;
  const serial = Number(text);
  return serial > 0 ? serial : null;
}

/**
 * Finds each column by its header (IMP-2). A column's header is its text on row 2, or on row 1 when
 * row 2 is empty. A header merged over both rows has the same text on each, and a grouped column has
 * its group on row 1 and its own name on row 2. Headers compare after squash().
 */
function findColumns(sheet: ExcelJS.Worksheet, columns: Column[]): Map<Field, number> {
  const headers: string[] = [];
  for (let column = 1; column <= sheet.columnCount; column++) {
    const [top, below] = [1, 2].map((row) => squash(valueText(sheet.getCell(row, column).value) ?? ""));
    headers[column] = below || top;
  }
  // Only a column before the last header counts as "the one with no header": formatting can reach
  // past the table on the right.
  const lastHeader = headers.findLastIndex(Boolean);
  const noHeader = headers.flatMap((header, column) => (column >= 1 && column < lastHeader && !header ? [column] : []));

  const found = new Map<Field, number>();
  const problems: string[] = [];
  for (const { field, headers: names, orNoHeader } of columns) {
    const wanted = new Set(names.map(squash));
    const matches = headers.flatMap((header, column) => (header && wanted.has(header) ? [column] : []));
    if (matches.length === 0 && orNoHeader && noHeader.length === 1) matches.push(noHeader[0]);
    if (matches.length === 1) found.set(field, matches[0]);
    else if (matches.length === 0)
      problems.push(`no column headed "${names[0]}"${orNoHeader ? " or without a header" : ""}`);
    else problems.push(`more than one column headed "${names[0]}"`);
  }
  if (problems.length > 0) throw new SheetLayoutError(`The tab "${sheet.name}" has ${problems.join(", ")}.`);
  return found;
}

function readTab(sheet: ExcelJS.Worksheet, tab: (typeof TABS)[number]): ReadSheet {
  const columns = findColumns(sheet, tab.columns);
  const rows: SheetRow[] = [];
  const serialsSeen = new Set<number>();
  let emptyRows = 0;

  for (let rowNumber = FIRST_ROW; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cell = (field: Field) => row.getCell(columns.get(field)!);
    const text = (field: Field) => (columns.has(field) ? line(cell(field)) : null);
    const notes = (fields: Field[]) => fields.map((field) => note(cell(field)));

    const serial = serialOf(cell("serial"));
    const read = {
      name: text("name"),
      childName: text("childName"),
      nic: text("nic"),
      address: text("address"),
      phone: text("phone"),
      district: text("district"),
      office: text("office"),
      installments: notes(["installment1", "installment2", "installment3", "installment4"]),
      levels: notes(["level1", "level2", "level3", "level4"]),
      remark: note(cell("remark")),
    };
    const hasText = Object.values(read).some((value) => (Array.isArray(value) ? value.some(Boolean) : value));
    if (!hasText && line(cell("serial")) === null) {
      emptyRows++;
      continue;
    }

    // IMP-7: the first row with a serial number is keyed on it; a later row with the same number, or a
    // row with none, on its row number.
    const keyedOnRow: RowKeyReason | null =
      serial === null ? "noSerial" : serialsSeen.has(serial) ? "repeatedSerial" : null;
    if (serial !== null) serialsSeen.add(serial);
    rows.push({
      category: tab.category,
      row: rowNumber,
      serial,
      key: keyedOnRow ? `${tab.category}:row:${rowNumber}` : `${tab.category}:serial:${serial}`,
      keyedOnRow,
      ...read,
    });
  }
  return { rows, emptyRows };
}

/** Every row of both tabs, care leavers first. Stops with a SheetLayoutError when a tab or column is missing. */
export function readSheet(workbook: ExcelJS.Workbook): ReadSheet {
  const result: ReadSheet = { rows: [], emptyRows: 0 };
  for (const tab of TABS) {
    const sheet = workbook.worksheets.find((s) => squash(s.name) === squash(tab.name));
    if (!sheet) throw new SheetLayoutError(`The sheet has no tab named "${tab.name}".`);
    const { rows, emptyRows } = readTab(sheet, tab);
    result.rows.push(...rows);
    result.emptyRows += emptyRows;
  }
  return result;
}
