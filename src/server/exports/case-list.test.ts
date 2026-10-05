import ExcelJS from "exceljs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../messages/si.json";
import { caseListColumns, type ExportRow } from "./case-list";
import { addSheet, workbookBytes, XLSX_TYPE, xlsxResponse } from "./workbook";

const t = createTranslator({ locale: "si", messages, namespace: "cases" });

/** Made-up cases (SEC-11). */
const released: ExportRow = {
  caseNumber: "HMG-2026-001",
  category: "CHILD_AT_RISK",
  kind: "NEW_HOUSE",
  status: "IN_PROGRESS",
  name: "ඒ. බී. පරීක්ෂණ",
  childName: "සී. පරීක්ෂණ",
  nic: "880001234V",
  address: "1, පරීක්ෂණ පාර, හෝමාගම",
  gnDivision: "හෝමාගම නැගෙනහිර",
  mobile1: "0771234567",
  mobile2: null,
  districtName: "කොළඹ",
  officeName: "හෝමාගම",
  submittedAt: new Date("2026-02-10T04:00:00Z"),
  // 01:30 on 2 March in Colombo, still 1 March in UTC.
  verifiedAt: new Date("2026-03-01T20:00:00Z"),
  completedAt: null,
  updatedAt: new Date("2026-04-05T06:00:00Z"),
  remark: null,
  release: { releasedOn: "2026-03-10", amount: 2_000_000, paidCount: 2, paidOut: 1_000_000 },
  stageName: "අත්තිවාරම",
};

const draft: ExportRow = {
  ...released,
  caseNumber: null,
  category: "CARE_LEAVER",
  kind: null,
  status: "DRAFT",
  childName: null,
  nic: "198800012345",
  mobile1: "0112345678",
  submittedAt: null,
  verifiedAt: null,
  release: null,
  stageName: null,
};

async function reopen(rows: ExportRow[]): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, t("export.sheet"), caseListColumns(t), rows);
  const again = new ExcelJS.Workbook();
  await again.xlsx.load((await workbookBytes(workbook)).buffer);
  return again.worksheets[0];
}

/** A row's cells by their Sinhala header. */
function byHeader(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const headers = sheet.getRow(1).values as unknown[];
  const row = sheet.getRow(rowNumber);
  return (key: keyof typeof messages.cases.export.columns) => row.getCell(headers.indexOf(t(`export.columns.${key}`)));
}

describe("the case list's Excel file (EXP-1)", () => {
  it("has a Sinhala sheet name and headers, one row per case, and a header row that stays in view", async () => {
    const sheet = await reopen([released, draft]);
    expect(sheet.name).toBe("ප්‍රතිලාභීන්");
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      Object.keys(messages.cases.export.columns).map((key) =>
        t(`export.columns.${key as keyof typeof messages.cases.export.columns}`),
      ),
    );
    expect(sheet.rowCount).toBe(3);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.getRow(1).font?.bold).toBe(true);
  });

  it("writes the list's words, keeps NICs and phone numbers as text, and dates as Colombo days", async () => {
    const sheet = await reopen([released, draft]);
    const cell = byHeader(sheet, 2);
    expect(cell("number").value).toBe("HMG-2026-001");
    expect(cell("category").value).toBe("අවදානම් දරුවන්");
    expect(cell("kind").value).toBe("නව නිවසක්");
    expect(cell("status").value).toBe("වැඩ සිදුවෙමින්");
    expect(cell("nic").value).toBe("880001234V");
    expect(cell("mobile1").value).toBe("0771234567");
    expect(cell("mobile2").value).toBeNull();

    expect(cell("verifiedOn").value).toEqual(new Date("2026-03-02T00:00:00Z"));
    expect(cell("verifiedOn").numFmt).toBe("yyyy.mm.dd");
    expect(cell("releasedOn").value).toEqual(new Date("2026-03-10T00:00:00Z"));

    expect(cell("released").value).toBe(2_000_000);
    expect(cell("released").numFmt).toBe("#,##0");
    expect(cell("paidCount").value).toBe(2);
    expect(cell("paidOut").value).toBe(1_000_000);
    expect(cell("balance").value).toBe(1_000_000);
    expect(cell("stage").value).toBe("අත්තිවාරම");

    const second = byHeader(sheet, 3);
    expect(second("nic").value).toBe("198800012345");
    expect(second("mobile1").value).toBe("0112345678");
    expect(second("status").value).toBe("තවම යවා නැත");
  });

  it("leaves the money, stage and date columns empty for a case that hasn't got that far", async () => {
    const sheet = await reopen([draft]);
    const cell = byHeader(sheet, 2);
    for (const key of [
      "number",
      "kind",
      "submittedOn",
      "verifiedOn",
      "releasedOn",
      "released",
      "paidCount",
      "paidOut",
      "balance",
      "stage",
      "completedOn",
    ] as const)
      expect(cell(key).value, key).toBeNull();
  });

  it("downloads as an attachment with a Sinhala file name and an ASCII stand-in, never cached", () => {
    const response = xlsxResponse(
      new Uint8Array([1, 2, 3]),
      t("export.fileName", { date: "2026-10-04" }),
      "diviyata-saviyak-2026-10-04.xlsx",
    );
    expect(response.headers.get("Content-Type")).toBe(XLSX_TYPE);
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="diviyata-saviyak-2026-10-04\.xlsx"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("''")[1])).toBe("දිවියට සවියක් ලැයිස්තුව 2026-10-04.xlsx");
  });

  it("names the file without zero-width joiners, which Chrome would save as '_'", () => {
    expect(t("export.fileName", { date: "2026-10-04" })).not.toMatch(/[‌‍]/);
  });
});
