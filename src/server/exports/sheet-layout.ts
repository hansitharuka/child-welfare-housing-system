import ExcelJS from "exceljs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Category, InstallmentStatus } from "@/generated/prisma/enums";
import { colomboDay, dateToDay, formatDate } from "@/lib/dates";
import { CATEGORIES, KINDS } from "@/lib/validation/case";
import { caseWhere } from "../cases/queries";
import type { Viewer } from "../permissions";
import { type CasesT, type ExportedFile, type ListFilter, logExport } from "./case-list";
import { addSheet, type Column, workbookBytes } from "./workbook";

/** The old sheet had four progress columns: foundation, wall, roof and completed. */
const PROGRESS_COLUMNS = 4;

export type SheetInstallment = {
  status: InstallmentStatus;
  /** "YYYY-MM-DD" */
  expectedOn: string | null;
  /** "YYYY-MM-DD" */
  releasedOn: string | null;
};

export type SheetRow = {
  caseNumber: string | null;
  category: Category | null;
  name: string | null;
  childName: string | null;
  nic: string | null;
  address: string | null;
  mobile1: string | null;
  mobile2: string | null;
  districtName: string;
  officeName: string;
  /** The four installments in order, made with the Rs. 2,000,000 release (INS-1); none before it. */
  installments: SheetInstallment[];
  /** For each progress column, the day ("YYYY-MM-DD") its stage was reached, or null. */
  progress: (string | null)[];
  remark: string | null;
};

/**
 * The stages under the old sheet's four progress columns, from a kind's active stages in order
 * (LST-4). The last column, "completed", is always the last stage, which finishes the house (CLS-1).
 * The columns before it take the first stages, as many as fit, so the four new-house stages fill one
 * column each. A kind with no stages leaves all four empty.
 */
export function progressStages<T>(stages: T[]): (T | null)[] {
  if (stages.length === 0) return Array<null>(PROGRESS_COLUMNS).fill(null);
  const before = stages.slice(0, -1).slice(0, PROGRESS_COLUMNS - 1);
  return [...before, ...Array<null>(PROGRESS_COLUMNS - 1 - before.length).fill(null), stages[stages.length - 1]];
}

/**
 * EXP-2: every case on Head Office's list except drafts, which haven't been sent and may have no
 * category yet (CASE-4). They come district by district and office by office, as the old sheet's
 * rows did, then by case number. Also the progress columns' headers: the new-house stages, the
 * only list the old sheet had. Null when the viewer may see no cases (PRM-2).
 */
export async function sheetRows(
  db: PrismaClient,
  viewer: Viewer,
  filter: ListFilter,
): Promise<{ rows: SheetRow[]; progressHeaders: (string | null)[] } | null> {
  const where = caseWhere(viewer, filter);
  if (!where) return null;

  const [found, stages] = await Promise.all([
    db.case.findMany({
      where: { AND: [where, { status: { not: "DRAFT" } }] },
      orderBy: [
        { dsOffice: { district: { nameEn: "asc" } } },
        { dsOffice: { nameEn: "asc" } },
        { caseNumber: { sort: "asc", nulls: "last" } },
        { id: "asc" },
      ],
      select: {
        caseNumber: true,
        category: true,
        kind: true,
        name: true,
        childName: true,
        nic: true,
        address: true,
        mobile1: true,
        mobile2: true,
        remark: true,
        dsOffice: { select: { nameSi: true, district: { select: { nameSi: true } } } },
        installments: { orderBy: { number: "asc" }, select: { status: true, expectedOn: true, releasedOn: true } },
        stageUpdates: { where: { stageId: { not: null } }, select: { stageId: true, visitedOn: true } },
      },
    }),
    db.stageDefinition.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, kind: true, nameSi: true },
    }),
  ]);

  const byKind = new Map(KINDS.map((kind) => [kind, progressStages(stages.filter((stage) => stage.kind === kind))]));
  const noStages = progressStages<(typeof stages)[number]>([]);

  const rows = found.map(({ dsOffice, installments, stageUpdates, kind, ...row }): SheetRow => {
    const reached = new Map(stageUpdates.map((update) => [update.stageId, dateToDay(update.visitedOn)]));
    return {
      ...row,
      districtName: dsOffice.district.nameSi,
      officeName: dsOffice.nameSi,
      installments: installments.map((item) => ({
        status: item.status,
        expectedOn: item.expectedOn && dateToDay(item.expectedOn),
        releasedOn: item.releasedOn && dateToDay(item.releasedOn),
      })),
      progress: (kind ? byKind.get(kind)! : noStages).map((stage) => (stage && reached.get(stage.id)) ?? null),
    };
  });
  return { rows, progressHeaders: byKind.get("NEW_HOUSE")!.map((stage) => stage?.nameSi ?? null) };
}

/** An installment cell: its status, with the day it was paid or is expected (EXP-2). */
function installmentCell(t: CasesT, item: SheetInstallment | undefined): string | null {
  if (!item) return null;
  if (item.status === "RELEASED" && item.releasedOn)
    return t("export.sheetLayout.installment.RELEASED", { date: formatDate(item.releasedOn) });
  if (item.status === "PROCESSING" && item.expectedOn)
    return t("export.sheetLayout.installment.PROCESSING", { date: formatDate(item.expectedOn) });
  return t(`installment.status.${item.status}`);
}

/**
 * The old sheet's columns for one tab, with its own headers. The children-at-risk tab has the
 * child's and the guardian's names. The case number stands where the sheet had its serial number.
 */
export function sheetColumns(t: CasesT, category: Category, progressHeaders: (string | null)[]): Column<SheetRow>[] {
  const careLeaver = category === "CARE_LEAVER";
  const money = t("export.sheetLayout.columns.money");
  const progress = t("export.sheetLayout.columns.progress");

  const names: Column<SheetRow>[] = careLeaver
    ? [{ header: t("export.sheetLayout.columns.name"), width: 28, value: (r) => r.name }]
    : [
        { header: t("export.sheetLayout.columns.childName"), width: 26, value: (r) => r.childName },
        { header: t("export.sheetLayout.columns.guardianName"), width: 28, value: (r) => r.name },
      ];
  return [
    { header: t("export.columns.number"), width: 16, value: (r) => r.caseNumber },
    ...names,
    {
      header: t(careLeaver ? "export.sheetLayout.columns.nic" : "export.sheetLayout.columns.guardianNic"),
      width: 18,
      value: (r) => r.nic,
    },
    { header: t("export.sheetLayout.columns.address"), width: 36, wrap: true, value: (r) => r.address },
    {
      header: t("export.sheetLayout.columns.phone"),
      width: 16,
      wrap: true,
      value: (r) => [r.mobile1, r.mobile2].filter(Boolean).join(" / ") || null,
    },
    { header: t("export.sheetLayout.columns.district"), width: 14, value: (r) => r.districtName },
    {
      header: t(careLeaver ? "export.sheetLayout.columns.division" : "export.sheetLayout.columns.office"),
      width: 20,
      value: (r) => r.officeName,
    },
    ...([1, 2, 3, 4] as const).map((number): Column<SheetRow> => ({
      header: t(`installment.name.${number}`),
      group: money,
      width: 22,
      wrap: true,
      value: (r) => installmentCell(t, r.installments[number - 1]),
    })),
    ...progressHeaders.map((name, index): Column<SheetRow> => ({
      header: name ?? "",
      group: progress,
      width: 14,
      value: (r) => {
        const day = r.progress[index];
        return day ? { day } : null;
      },
    })),
    { header: t("export.sheetLayout.columns.remark"), width: 36, wrap: true, value: (r) => r.remark },
  ];
}

/**
 * EXP-2 and EXP-3: Head Office's list in the old sheet's layout, one tab per category, and an audit
 * record of who made it, with which filters and how many rows. Null when the viewer may see no
 * cases (PRM-2).
 */
export async function exportSheetLayout(
  db: PrismaClient,
  viewer: Viewer & { userId: string },
  filter: ListFilter,
  t: CasesT,
  now = new Date(),
): Promise<ExportedFile | null> {
  const found = await sheetRows(db, viewer, filter);
  if (!found) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.created = now;
  let rows = 0;
  for (const category of CATEGORIES) {
    const tab = found.rows.filter((row) => row.category === category);
    addSheet(workbook, t(`category.${category}`), sheetColumns(t, category, found.progressHeaders), tab);
    rows += tab.length;
  }
  const bytes = await workbookBytes(workbook);

  await logExport(db, viewer, "ho_sheet", filter, rows);

  const today = colomboDay(now);
  return {
    bytes,
    fileName: t("export.sheetLayout.fileName", { date: today }),
    asciiName: `diviyata-saviyak-sheet-layout-${today}.xlsx`,
    rows,
  };
}
