import ExcelJS from "exceljs";
import { dayToDate } from "@/lib/dates";

/** A cell's value: text, a whole number, a calendar day ("YYYY-MM-DD"), or empty. */
export type CellValue = string | number | { day: string } | null;

/** One column of an exported sheet: its Sinhala header, its width in characters, and how to read a row. */
export type Column<Row> = {
  header: string;
  width: number;
  value: (row: Row) => CellValue;
  /** Amounts are whole rupees and show with thousands separators. */
  amount?: boolean;
};

/** Days show the way offices write them (UI-3), and stay real dates, so Excel can sort and filter them. */
const DAY_FORMAT = "yyyy.mm.dd";
const AMOUNT_FORMAT = "#,##0";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Adds one sheet: a bold header row that stays in view and has Excel's filter buttons, then one
 * row per item. Text stays text, so NICs and phone numbers keep their leading zeros.
 */
export function addSheet<Row>(workbook: ExcelJS.Workbook, name: string, columns: Column<Row>[], rows: Row[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column.header, width: column.width }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "top", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFEA" } };

  for (const row of rows) {
    const values = columns.map((column) => column.value(row));
    const added = sheet.addRow(values.map((value) => (isDay(value) ? dayToDate(value.day) : value)));
    values.forEach((value, index) => {
      if (isDay(value)) added.getCell(index + 1).numFmt = DAY_FORMAT;
      else if (columns[index].amount && value !== null) added.getCell(index + 1).numFmt = AMOUNT_FORMAT;
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

// A day is written as midnight UTC, and Excel counts days in UTC, so the calendar day stays the same.
const isDay = (value: CellValue): value is { day: string } => typeof value === "object" && value !== null;

export async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/**
 * The file as a download. The name may hold Sinhala letters: an ASCII stand-in, plus the real name
 * in UTF-8 (RFC 6266). Chrome saves a zero-width joiner in a file name as "_", so file names avoid
 * letters that need one, such as ප්‍ර. Nothing is cached, because the file holds personal details.
 */
export function xlsxResponse(bytes: Uint8Array<ArrayBuffer>, fileName: string, asciiName: string): Response {
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
