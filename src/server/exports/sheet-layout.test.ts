import ExcelJS from "exceljs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../messages/si.json";
import type { Category } from "@/generated/prisma/enums";
import { progressStages, type SheetRow, sheetColumns } from "./sheet-layout";
import { addSheet, workbookBytes } from "./workbook";

const t = createTranslator({ locale: "si", messages, namespace: "cases" });
const STAGES = ["අත්තිවාරම් මට්ටම", "බිත්ති මට්ටම", "වහල මට්ටම", "නිමයි"];

/** Made-up cases (SEC-11). */
const building: SheetRow = {
  caseNumber: "HMG-2026-001",
  category: "CARE_LEAVER",
  name: "ඒ. බී. පරීක්ෂණ",
  childName: null,
  nic: "880001234V",
  address: "1, පරීක්ෂණ පාර, හෝමාගම",
  mobile1: "0771234567",
  mobile2: "0112345678",
  districtName: "කොළඹ",
  officeName: "හෝමාගම",
  installments: [
    { status: "RELEASED", expectedOn: "2026-03-01", releasedOn: "2026-03-10" },
    { status: "PROCESSING", expectedOn: "2026-04-01", releasedOn: null },
    { status: "NOT_STARTED", expectedOn: null, releasedOn: null },
    { status: "NOT_STARTED", expectedOn: null, releasedOn: null },
  ],
  progress: ["2026-03-15", "2026-03-15", null, null],
  remark: "පරීක්ෂණ සටහනක්",
};

const atRisk: SheetRow = {
  ...building,
  caseNumber: "HMG-2026-002",
  category: "CHILD_AT_RISK",
  name: "සී. පරීක්ෂණ",
  childName: "ඩී. පරීක්ෂණ",
  nic: "198800012345",
  mobile2: null,
  installments: [],
  progress: [null, null, null, null],
  remark: null,
};

async function reopen(category: Category, rows: SheetRow[], headers: (string | null)[] = STAGES) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, t(`category.${category}`), sheetColumns(t, category, headers), rows);
  const again = new ExcelJS.Workbook();
  await again.xlsx.load((await workbookBytes(workbook)).buffer);
  return again.worksheets[0];
}

const values = (sheet: ExcelJS.Worksheet, row: number) => (sheet.getRow(row).values as unknown[]).slice(1);

describe("the old sheet's progress columns (EXP-2)", () => {
  it("gives the four new-house stages one column each", () => {
    expect(progressStages(["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the last stage under 'completed' when a kind has fewer or more stages", () => {
    expect(progressStages([])).toEqual([null, null, null, null]);
    expect(progressStages(["a"])).toEqual([null, null, null, "a"]);
    expect(progressStages(["a", "b", "c"])).toEqual(["a", "b", null, "c"]);
    expect(progressStages(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "f"]);
  });
});

describe("the sheet-layout Excel file (EXP-2, AC-18)", () => {
  it("has the care leavers' tab with the old sheet's two-row Sinhala header", async () => {
    const sheet = await reopen("CARE_LEAVER", [building]);
    expect(sheet.name).toBe("නිවාසගත");
    expect(values(sheet, 1)).toEqual([
      "ලියාපදිංචි අංකය",
      "නම",
      "ජාතික හැඳුනුම්පත් අංකය",
      "ලිපිනය",
      "දුරකතන අංකය",
      "දිස්ත්‍රික්කය",
      "ප්‍රා.ලේ. කොට්ඨාසය",
      ...Array(4).fill("මූල්‍ය ප්‍රගතිය (රු)"),
      ...Array(4).fill("භෞතික ප්‍රගතිය"),
      "සටහන්",
    ]);
    expect(values(sheet, 2).slice(7, 15)).toEqual([
      "පළමු වාරිකය",
      "දෙවන වාරිකය",
      "තුන්වන වාරිකය",
      "සිව්වන වාරිකය",
      ...STAGES,
    ]);
    expect([...sheet.model.merges].sort()).toEqual(
      ["A1:A2", "B1:B2", "C1:C2", "D1:D2", "E1:E2", "F1:F2", "G1:G2", "H1:K1", "L1:O1", "P1:P2"].sort(),
    );
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
    expect(sheet.getRow(2).font?.bold).toBe(true);
    expect(sheet.rowCount).toBe(3);
  });

  it("has the children-at-risk tab with the child's and the guardian's names", async () => {
    const sheet = await reopen("CHILD_AT_RISK", [atRisk]);
    expect(sheet.name).toBe("අවදානම් දරුවන්");
    expect(values(sheet, 1).slice(0, 8)).toEqual([
      "ලියාපදිංචි අංකය",
      "දරුවාගේ නම",
      "භාරකරුගේ නම",
      "භාරකරුගේ ජාතික හැඳුනුම්පත් අංකය",
      "ලිපිනය",
      "දුරකතන අංකය",
      "දිස්ත්‍රික්කය",
      "ප්‍රා.ලේ. කාර්යාලය",
    ]);
    expect(sheet.model.merges).toContain("I1:L1");
    expect(sheet.model.merges).toContain("M1:P1");
    expect(values(sheet, 3).slice(0, 8)).toEqual([
      "HMG-2026-002",
      "ඩී. පරීක්ෂණ",
      "සී. පරීක්ෂණ",
      "198800012345",
      "1, පරීක්ෂණ පාර, හෝමාගම",
      "0771234567",
      "කොළඹ",
      "හෝමාගම",
    ]);
  });

  it("shows each installment's status and day, and the day each stage was reached as a real date", async () => {
    const row = (await reopen("CARE_LEAVER", [building])).getRow(3);
    expect(row.getCell(1).value).toBe("HMG-2026-001");
    expect(row.getCell(3).value).toBe("880001234V");
    expect(row.getCell(5).value).toBe("0771234567 / 0112345678");
    expect([8, 9, 10, 11].map((n) => row.getCell(n).value)).toEqual([
      "ගෙවා ඇත (2026.03.10)",
      "ගෙවීමට කටයුතු කරමින් (බලාපොරොත්තු දිනය: 2026.04.01)",
      "තවම ආරම්භ කර නැත",
      "තවම ආරම්භ කර නැත",
    ]);
    expect(row.getCell(12).value).toEqual(new Date("2026-03-15T00:00:00Z"));
    expect(row.getCell(12).numFmt).toBe("yyyy.mm.dd");
    expect(row.getCell(14).value).toBeNull();
    expect(row.getCell(16).value).toBe("පරීක්ෂණ සටහනක්");
  });

  it("leaves the money and progress cells empty before the Rs. 2,000,000 is released", async () => {
    const row = (await reopen("CHILD_AT_RISK", [atRisk])).getRow(3);
    for (let cell = 9; cell <= 17; cell++) expect(row.getCell(cell).value, String(cell)).toBeNull();
  });

  it("leaves a progress header empty when the new-house list has no stage for it", async () => {
    const sheet = await reopen("CARE_LEAVER", [], progressStages(["අත්තිවාරම් මට්ටම", "නිමයි"]));
    expect(values(sheet, 2).slice(11, 15)).toEqual(["අත්තිවාරම් මට්ටම", "", "", "නිමයි"]);
  });

  it("names the file without zero-width joiners, which Chrome would save as '_'", () => {
    expect(t("export.sheetLayout.fileName", { date: "2026-10-04" })).toBe("දිවියට සවියක් පැරණි ආකෘතිය 2026-10-04.xlsx");
    expect(t("export.sheetLayout.fileName", { date: "2026-10-04" })).not.toMatch(/[‌‍]/);
  });
});
