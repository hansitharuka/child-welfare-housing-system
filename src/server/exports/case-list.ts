import ExcelJS from "exceljs";
import type { getTranslations } from "next-intl/server";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseStatus, Category, Kind } from "@/generated/prisma/enums";
import { colomboDay, dateToDay } from "@/lib/dates";
import { writeAudit } from "../audit";
import { type CaseFilter, caseWhere } from "../cases/queries";
import type { Viewer } from "../permissions";
import { addSheet, type CellValue, type Column, workbookBytes } from "./workbook";

export type CasesT = Awaited<ReturnType<typeof getTranslations<"cases">>>;

/** The search of a list, without its page: the export holds every page. */
export type ListFilter = Omit<CaseFilter, "page">;

/**
 * Which list was exported, as the audit record names it (EXP-3). `ho_sheet` is Head Office's list
 * in the old sheet's layout (EXP-2).
 */
export type ListName = "ho_cases" | "ds_cases" | "ho_sheet";

export type ExportRow = {
  caseNumber: string | null;
  category: Category | null;
  kind: Kind | null;
  status: CaseStatus;
  name: string | null;
  childName: string | null;
  nic: string | null;
  address: string | null;
  mobile1: string | null;
  mobile2: string | null;
  districtName: string;
  officeName: string;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  remark: string | null;
  /** The Rs. 2,000,000 release (REL-2), once recorded; null before it. */
  release: { releasedOn: string; amount: number; paidCount: number; paidOut: number } | null;
  /** The highest stage reached, if any. */
  stageName: string | null;
};

/**
 * Every case on the list the viewer sees, in the screen's order (EXP-1, FND-1, HOME-2), or null
 * when they may see no cases (PRM-2).
 */
export async function caseListRows(db: PrismaClient, viewer: Viewer, filter: ListFilter): Promise<ExportRow[] | null> {
  const where = caseWhere(viewer, filter);
  if (!where) return null;

  const found = await db.case.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      caseNumber: true,
      category: true,
      kind: true,
      status: true,
      name: true,
      childName: true,
      nic: true,
      address: true,
      mobile1: true,
      mobile2: true,
      remark: true,
      submittedAt: true,
      verifiedAt: true,
      completedAt: true,
      updatedAt: true,
      dsOffice: { select: { nameSi: true, district: { select: { nameSi: true } } } },
      release: { select: { releasedOn: true, amount: true } },
      installments: { where: { status: "RELEASED" }, select: { amount: true } },
      stageUpdates: {
        where: { stageId: { not: null } },
        orderBy: { stage: { sortOrder: "desc" } },
        take: 1,
        select: { stage: { select: { nameSi: true } } },
      },
    },
  });

  return found.map(({ dsOffice, release, installments, stageUpdates, ...row }) => ({
    ...row,
    officeName: dsOffice.nameSi,
    districtName: dsOffice.district.nameSi,
    release: release && {
      releasedOn: dateToDay(release.releasedOn),
      amount: release.amount,
      paidCount: installments.length,
      paidOut: installments.reduce((sum, i) => sum + i.amount, 0),
    },
    stageName: stageUpdates[0]?.stage?.nameSi ?? null,
  }));
}

/** A moment shown as its calendar day in Colombo (ARC-6). */
const day = (date: Date | null): CellValue => (date ? { day: colomboDay(date) } : null);

/** EXP-1's columns, with Sinhala headers. A case not yet released leaves its money columns empty. */
export function caseListColumns(t: CasesT): Column<ExportRow>[] {
  return [
    { header: t("export.columns.number"), width: 16, value: (r) => r.caseNumber },
    { header: t("export.columns.category"), width: 16, value: (r) => r.category && t(`category.${r.category}`) },
    { header: t("export.columns.kind"), width: 14, value: (r) => r.kind && t(`kindShort.${r.kind}`) },
    { header: t("export.columns.status"), width: 18, value: (r) => t(`status.${r.status}`) },
    { header: t("export.columns.name"), width: 30, value: (r) => r.name },
    { header: t("export.columns.childName"), width: 26, value: (r) => r.childName },
    { header: t("export.columns.nic"), width: 16, value: (r) => r.nic },
    { header: t("export.columns.address"), width: 40, value: (r) => r.address },
    { header: t("export.columns.mobile1"), width: 14, value: (r) => r.mobile1 },
    { header: t("export.columns.mobile2"), width: 14, value: (r) => r.mobile2 },
    { header: t("export.columns.district"), width: 16, value: (r) => r.districtName },
    { header: t("export.columns.office"), width: 22, value: (r) => r.officeName },
    { header: t("export.columns.submittedOn"), width: 14, value: (r) => day(r.submittedAt) },
    { header: t("export.columns.verifiedOn"), width: 14, value: (r) => day(r.verifiedAt) },
    { header: t("export.columns.releasedOn"), width: 14, value: (r) => r.release && { day: r.release.releasedOn } },
    { header: t("export.columns.released"), width: 16, amount: true, value: (r) => r.release?.amount ?? null },
    { header: t("export.columns.paidCount"), width: 10, value: (r) => r.release?.paidCount ?? null },
    { header: t("export.columns.paidOut"), width: 16, amount: true, value: (r) => r.release?.paidOut ?? null },
    {
      header: t("export.columns.balance"),
      width: 16,
      amount: true,
      value: (r) => (r.release ? r.release.amount - r.release.paidOut : null),
    },
    { header: t("export.columns.stage"), width: 18, value: (r) => r.stageName },
    { header: t("export.columns.completedOn"), width: 14, value: (r) => day(r.completedAt) },
    { header: t("export.columns.updatedOn"), width: 14, value: (r) => day(r.updatedAt) },
    { header: t("export.columns.remark"), width: 40, value: (r) => r.remark },
  ];
}

/** The filters as the audit record keeps them: only those used, plus the office a DS officer's list covers. */
function usedFilters(viewer: Viewer, filter: ListFilter): Prisma.InputJsonObject {
  const used: Record<string, Prisma.InputJsonValue> = {};
  const q = filter.q?.trim();
  if (q) used.q = q;
  if (filter.statuses) used.statuses = filter.statuses;
  if (filter.category) used.category = filter.category;
  if (filter.kind) used.kind = filter.kind;
  if (filter.districtId) used.districtId = filter.districtId;
  if (filter.dsOfficeId) used.dsOfficeId = filter.dsOfficeId;
  if (viewer.role === "DS_OFFICER" && viewer.dsOfficeId !== null) used.officeScope = viewer.dsOfficeId;
  return used;
}

export type ExportedFile = { bytes: Uint8Array<ArrayBuffer>; fileName: string; asciiName: string; rows: number };

/** EXP-3: who exported which list, with which filters, and how many rows the file held. */
export async function logExport(
  db: PrismaClient,
  viewer: Viewer & { userId: string },
  list: ListName,
  filter: ListFilter,
  rows: number,
) {
  await writeAudit(db, {
    actorId: viewer.userId,
    action: "cases_exported",
    entityType: "case_list",
    entityId: list,
    after: { filters: usedFilters(viewer, filter), rows },
  });
}

/**
 * EXP-1 and EXP-3: the list as an `.xlsx` file of every matching case, and an audit record of who
 * made it, with which filters and how many rows. Null when the viewer may see no cases (PRM-2).
 */
export async function exportCaseList(
  db: PrismaClient,
  viewer: Viewer & { userId: string },
  list: ListName,
  filter: ListFilter,
  t: CasesT,
  now = new Date(),
): Promise<ExportedFile | null> {
  const rows = await caseListRows(db, viewer, filter);
  if (!rows) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.created = now;
  addSheet(workbook, t("export.sheet"), caseListColumns(t), rows);
  const bytes = await workbookBytes(workbook);

  await logExport(db, viewer, list, filter, rows.length);

  const today = colomboDay(now);
  return {
    bytes,
    fileName: t("export.fileName", { date: today }),
    asciiName: `diviyata-saviyak-${today}.xlsx`,
    rows: rows.length,
  };
}
