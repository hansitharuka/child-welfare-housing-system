import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseStatus, Category, InstallmentStatus, Kind } from "@/generated/prisma/enums";
import { dateToDay } from "@/lib/dates";
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
  verifiedAt: Date | null;
  updatedAt: Date;
  /** Head Office's reason, while the case is sent back (CASE-7). */
  returnReason: string | null;
  /** Head Office's reason for rejecting it (CHK-3). */
  rejectReason: string | null;
  documents: { id: string; name: string }[];
  /** The Rs. 2,000,000 release, once recorded (REL-2). */
  release: ReleaseDetails | null;
  /** The four installments, made with the release (INS-1), in order. */
  installments: InstallmentDetails[];
};

export type ReleaseDetails = {
  /** "YYYY-MM-DD" */
  releasedOn: string;
  amount: number;
  referenceNumber: string;
  note: string | null;
  byName: string;
  at: Date;
};

export type InstallmentDetails = {
  number: number;
  amount: number;
  status: InstallmentStatus;
  purpose: string | null;
  /** "YYYY-MM-DD" */
  expectedOn: string | null;
  /** "YYYY-MM-DD" */
  releasedOn: string | null;
  note: string | null;
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
      verifiedAt: true,
      updatedAt: true,
      dsOffice: { select: { nameSi: true, active: true, district: { select: { id: true, nameSi: true } } } },
      files: {
        where: { removedAt: null },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, originalName: true },
      },
      decisions: {
        where: { type: { in: ["SEND_BACK", "REJECT"] } },
        orderBy: { at: "desc" },
        take: 1,
        select: { type: true, reason: true },
      },
      release: {
        select: {
          releasedOn: true,
          amount: true,
          referenceNumber: true,
          note: true,
          at: true,
          by: { select: { name: true } },
        },
      },
      installments: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          amount: true,
          status: true,
          purpose: true,
          expectedOn: true,
          releasedOn: true,
          note: true,
        },
      },
    },
  });
  if (!found || !canSeeOffice(viewer, found.dsOfficeId)) return null;
  const { dsOffice, files, decisions, release, installments, ...fields } = found;
  const latest = decisions[0];
  return {
    ...fields,
    officeName: dsOffice.nameSi,
    officeActive: dsOffice.active,
    districtId: dsOffice.district.id,
    districtName: dsOffice.district.nameSi,
    returnReason: found.status === "RETURNED" && latest?.type === "SEND_BACK" ? latest.reason : null,
    rejectReason: found.status === "REJECTED" && latest?.type === "REJECT" ? latest.reason : null,
    documents: files.map((f) => ({ id: f.id, name: f.originalName })),
    release: release && {
      releasedOn: dateToDay(release.releasedOn),
      amount: release.amount,
      referenceNumber: release.referenceNumber,
      note: release.note,
      byName: release.by.name,
      at: release.at,
    },
    installments: installments.map((i) => ({
      ...i,
      expectedOn: i.expectedOn && dateToDay(i.expectedOn),
      releasedOn: i.releasedOn && dateToDay(i.releasedOn),
    })),
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

/** The officer's own office with its district, for the DS home and form (HOME-1, CASE-3). */
export async function officeSummary(
  db: PrismaClient,
  dsOfficeId: number,
): Promise<{ name: string; districtName: string; active: boolean } | null> {
  const office = await db.dsOffice.findUnique({
    where: { id: dsOfficeId },
    select: { nameSi: true, active: true, district: { select: { nameSi: true } } },
  });
  return office ? { name: office.nameSi, districtName: office.district.nameSi, active: office.active } : null;
}
