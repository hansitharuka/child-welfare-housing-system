import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseStatus, Category, Kind } from "@/generated/prisma/enums";
import { nicKey, normaliseNic } from "@/lib/nic";
import { canSeeOffice, officeFilter, type Viewer } from "../permissions";

export type CaseDetails = {
  id: string;
  caseNumber: string | null;
  status: CaseStatus;
  category: Category | null;
  kind: Kind | null;
  name: string | null;
  childName: string | null;
  nic: string | null;
  address: string | null;
  mobile1: string | null;
  mobile2: string | null;
  remark: string | null;
  dsOfficeId: number;
  officeName: string;
  officeActive: boolean;
  districtId: number;
  districtName: string;
  version: number;
  submittedAt: Date | null;
  updatedAt: Date;
  /** Head Office's reason, while the case is sent back (CASE-7). */
  returnReason: string | null;
  documents: { id: string; name: string }[];
};

/** One case, if the viewer may see it (PRM-1); otherwise null, which the page shows as "not found". */
export async function getCase(db: PrismaClient, viewer: Viewer, id: string): Promise<CaseDetails | null> {
  const found = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      category: true,
      kind: true,
      name: true,
      childName: true,
      nic: true,
      address: true,
      mobile1: true,
      mobile2: true,
      remark: true,
      dsOfficeId: true,
      version: true,
      submittedAt: true,
      updatedAt: true,
      dsOffice: { select: { nameSi: true, active: true, district: { select: { id: true, nameSi: true } } } },
      files: {
        where: { removedAt: null },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, originalName: true },
      },
      decisions: {
        where: { type: "SEND_BACK" },
        orderBy: { at: "desc" },
        take: 1,
        select: { reason: true },
      },
    },
  });
  if (!found || !canSeeOffice(viewer, found.dsOfficeId)) return null;
  const { dsOffice, files, decisions, ...fields } = found;
  return {
    ...fields,
    officeName: dsOffice.nameSi,
    officeActive: dsOffice.active,
    districtId: dsOffice.district.id,
    districtName: dsOffice.district.nameSi,
    returnReason: found.status === "RETURNED" ? (decisions[0]?.reason ?? null) : null,
    documents: files.map((f) => ({ id: f.id, name: f.originalName })),
  };
}

export type CaseFilter = {
  /** Matches the name, child's name, case number or NIC (HOME-2, FND-1). */
  q?: string;
  statuses?: CaseStatus[];
  category?: Category;
  kind?: Kind;
  districtId?: number;
  dsOfficeId?: number;
  /** 1 is the first page. */
  page?: number;
};

export const PAGE_SIZE = 50;

export type CaseRow = {
  id: string;
  caseNumber: string | null;
  status: CaseStatus;
  category: Category | null;
  kind: Kind | null;
  name: string | null;
  childName: string | null;
  officeName: string;
  districtName: string;
  submittedAt: Date | null;
  updatedAt: Date;
};

/** The Prisma filter for what the viewer may see and asked for; null when they may see nothing. */
function caseWhere(viewer: Viewer, filter: CaseFilter): Prisma.CaseWhereInput | null {
  const scope = officeFilter(viewer);
  if (!scope) return null;

  const and: Prisma.CaseWhereInput[] = [scope];
  if (filter.statuses) and.push({ status: { in: filter.statuses } });
  if (filter.category) and.push({ category: filter.category });
  if (filter.kind) and.push({ kind: filter.kind });
  if (filter.districtId) and.push({ dsOffice: { districtId: filter.districtId } });
  if (filter.dsOfficeId) and.push({ dsOfficeId: filter.dsOfficeId });

  const q = filter.q?.trim();
  if (q) {
    const key = nicKey(q);
    const compact = normaliseNic(q);
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { childName: { contains: q, mode: "insensitive" } },
        { caseNumber: { contains: compact } },
        { nic: { contains: compact } },
        ...(key ? [{ nicKey: key }] : []),
      ],
    });
  }
  return { AND: and };
}

/** A page of cases the viewer may see, the latest change first (FND-1, HOME-1). */
export async function listCases(
  db: PrismaClient,
  viewer: Viewer,
  filter: CaseFilter,
): Promise<{ rows: CaseRow[]; total: number }> {
  const where = caseWhere(viewer, filter);
  if (!where) return { rows: [], total: 0 };
  const page = Math.max(1, filter.page ?? 1);

  const [found, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        caseNumber: true,
        status: true,
        category: true,
        kind: true,
        name: true,
        childName: true,
        submittedAt: true,
        updatedAt: true,
        dsOffice: { select: { nameSi: true, district: { select: { nameSi: true } } } },
      },
    }),
    db.case.count({ where }),
  ]);
  return {
    rows: found.map(({ dsOffice, ...row }) => ({
      ...row,
      officeName: dsOffice.nameSi,
      districtName: dsOffice.district.nameSi,
    })),
    total,
  };
}

export async function countCases(db: PrismaClient, viewer: Viewer, filter: CaseFilter): Promise<number> {
  const where = caseWhere(viewer, filter);
  return where ? db.case.count({ where }) : 0;
}

export type TodoItem = {
  id: string;
  type: "returned" | "draft";
  name: string | null;
  childName: string | null;
  /** Head Office's reason for sending the case back. */
  reason: string | null;
  updatedAt: Date;
};

/**
 * HOME-3, the part Phase 4 can fill: cases sent back, with Head Office's reason, then drafts.
 * Due installments and cases without an update come with Phase 6.
 */
export async function todoItems(db: PrismaClient, viewer: Viewer): Promise<TodoItem[]> {
  const scope = officeFilter(viewer);
  if (!scope) return [];
  const found = await db.case.findMany({
    where: { ...scope, status: { in: ["RETURNED", "DRAFT"] } },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      id: true,
      status: true,
      name: true,
      childName: true,
      updatedAt: true,
      decisions: { where: { type: "SEND_BACK" }, orderBy: { at: "desc" }, take: 1, select: { reason: true } },
    },
  });
  return found.map((c) => ({
    id: c.id,
    type: c.status === "RETURNED" ? "returned" : "draft",
    name: c.name,
    childName: c.childName,
    reason: c.status === "RETURNED" ? (c.decisions[0]?.reason ?? null) : null,
    updatedAt: c.updatedAt,
  }));
}

/** Whether a DS office takes new cases (LST-3). */
export async function officeIsActive(db: PrismaClient, dsOfficeId: number): Promise<boolean> {
  const office = await db.dsOffice.findUnique({ where: { id: dsOfficeId }, select: { active: true } });
  return office?.active === true;
}
