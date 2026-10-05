import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseStatus, Category, InstallmentStatus, Kind } from "@/generated/prisma/enums";
import { addDays, colomboDay, colomboStartOf, dateToDay, dayToDate, daysBetween } from "@/lib/dates";
import { nicKey, normaliseNic } from "@/lib/nic";
import { CONFIRMED_NEEDS, IMPORTED_NEEDS } from "@/lib/validation/case";
import type { SheetNotes } from "../import/commands";
import { canSeeOffice, officeFilter, type Viewer } from "../permissions";
import { missingImported } from "./rules";

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
  /** When the system found it finished (CLS-1). */
  completedAt: Date | null;
  updatedAt: Date;
  /** Head Office's reason, while the case is sent back (CASE-7). */
  returnReason: string | null;
  /** Head Office's reason for rejecting it (CHK-3). */
  rejectReason: string | null;
  /** While the case is stopped: when, why, and the status it goes back to when reopened (CLS-2, CLS-3). */
  stop: { at: Date; reason: string | null; statusBefore: CaseStatus | null } | null;
  documents: { id: string; name: string }[];
  /** The Rs. 2,000,000 release, once recorded (REL-2). */
  release: ReleaseDetails | null;
  /** The four installments, made with the release (INS-1), in order. */
  installments: InstallmentDetails[];
  /** Brought in from the old sheet (IMP-1). */
  fromSheet: boolean;
  /** Where it was on the sheet: its row on its category's tab, and its serial number there, if any (IMP-7). */
  sheetRef: { row: number; serial: number | null } | null;
  /** What the old sheet said, on a case brought in from it (IMP-5); read-only. */
  sheetNotes: SheetNotes | null;
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
      completedAt: true,
      statusBeforeStop: true,
      updatedAt: true,
      sheetKey: true,
      sheetRow: true,
      sheetSerial: true,
      sheetNotes: true,
      dsOffice: { select: { nameSi: true, active: true, district: { select: { id: true, nameSi: true } } } },
      files: {
        where: { kind: "DOCUMENT", removedAt: null },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, originalName: true },
      },
      decisions: {
        // A case from the sheet confirmed as rejected or stopped has its reason on that confirmation (IMP-5).
        where: { type: { in: ["SEND_BACK", "REJECT", "STOP", "CONFIRM_IMPORT"] } },
        orderBy: { at: "desc" },
        take: 1,
        select: { type: true, reason: true, at: true },
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
  const {
    dsOffice,
    files,
    decisions,
    release,
    installments,
    statusBeforeStop,
    sheetKey,
    sheetRow,
    sheetSerial,
    sheetNotes,
    ...fields
  } = found;
  const latest = decisions[0];
  const confirmed = latest?.type === "CONFIRM_IMPORT";
  const stopped = found.status === "STOPPED" && (latest?.type === "STOP" || confirmed);
  return {
    ...fields,
    officeName: dsOffice.nameSi,
    officeActive: dsOffice.active,
    districtId: dsOffice.district.id,
    districtName: dsOffice.district.nameSi,
    returnReason: found.status === "RETURNED" && latest?.type === "SEND_BACK" ? latest.reason : null,
    rejectReason: found.status === "REJECTED" && (latest?.type === "REJECT" || confirmed) ? latest.reason : null,
    stop:
      found.status === "STOPPED"
        ? {
            at: stopped ? latest.at : fields.updatedAt,
            reason: stopped ? latest.reason : null,
            statusBefore: statusBeforeStop,
          }
        : null,
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
    fromSheet: sheetKey !== null,
    sheetRef: sheetRow === null ? null : { row: sheetRow, serial: sheetSerial },
    // Only the import writes it (src/server/import/commands.ts).
    sheetNotes: sheetNotes as SheetNotes | null,
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
  /** Only cases brought in from the sheet that still lack what their office fills in (IMP-4). */
  detailsMissing?: boolean;
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
  /** Installments paid (HOME-1); null before the release makes them. */
  paid: number | null;
  /** The highest stage reached (HOME-1), if any. */
  stageName: string | null;
  /** Brought in from the sheet and still missing details its office fills in (IMP-4). */
  detailsMissing: boolean;
};

/**
 * IMP-4: a case brought in from the sheet that still lacks the kind of help, the NIC or a phone number,
 * which its office fills in (IMP-5). Once Head Office has confirmed it, the kind is set, and the case
 * stays here while it is verified or in progress with no NIC or first phone number (missingImported).
 */
const DETAILS_MISSING = {
  OR: [
    { status: "IMPORTED", OR: IMPORTED_NEEDS.map((field) => ({ [field]: null })) },
    {
      sheetKey: { not: null },
      status: { in: ["VERIFIED", "IN_PROGRESS"] },
      OR: CONFIRMED_NEEDS.map((field) => ({ [field]: null })),
    },
  ],
} satisfies Prisma.CaseWhereInput;

/** A case in progress with no update for this many days is shown as waiting for one (HOME-1, HOME-3, DSH-1). */
export const STALE_DAYS = 30;

/** A case last changed before this moment has had no update for STALE_DAYS days or more, in Colombo days. */
export function staleBefore(now: Date): Date {
  return colomboStartOf(addDays(colomboDay(now), 1 - STALE_DAYS));
}

/**
 * The Prisma filter for what the viewer may see and asked for; null when they may see nothing.
 * The list and its Excel export (EXP-1) both use it, so the file holds exactly the screen's cases.
 */
export function caseWhere(viewer: Viewer, filter: CaseFilter): Prisma.CaseWhereInput | null {
  const scope = officeFilter(viewer);
  if (!scope) return null;

  const and: Prisma.CaseWhereInput[] = [scope];
  if (filter.statuses) and.push({ status: { in: filter.statuses } });
  if (filter.category) and.push({ category: filter.category });
  if (filter.kind) and.push({ kind: filter.kind });
  if (filter.districtId) and.push({ dsOffice: { districtId: filter.districtId } });
  if (filter.dsOfficeId) and.push({ dsOfficeId: filter.dsOfficeId });
  if (filter.detailsMissing) and.push(DETAILS_MISSING);

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
        nic: true,
        mobile1: true,
        sheetKey: true,
        submittedAt: true,
        updatedAt: true,
        dsOffice: { select: { nameSi: true, district: { select: { nameSi: true } } } },
        release: { select: { id: true } },
        _count: { select: { installments: { where: { status: "RELEASED" } } } },
        stageUpdates: {
          where: { stageId: { not: null } },
          orderBy: { stage: { sortOrder: "desc" } },
          take: 1,
          select: { stage: { select: { nameSi: true } } },
        },
      },
    }),
    db.case.count({ where }),
  ]);
  return {
    rows: found.map(({ dsOffice, release, _count, stageUpdates, nic, mobile1, sheetKey, ...row }) => ({
      ...row,
      detailsMissing: missingImported({ ...row, nic, mobile1, fromSheet: sheetKey !== null }).length > 0,
      officeName: dsOffice.nameSi,
      districtName: dsOffice.district.nameSi,
      paid: release ? _count.installments : null,
      stageName: stageUpdates[0]?.stage?.nameSi ?? null,
    })),
    total,
  };
}

export async function countCases(db: PrismaClient, viewer: Viewer, filter: CaseFilter): Promise<number> {
  const where = caseWhere(viewer, filter);
  return where ? db.case.count({ where }) : 0;
}

type TodoCase = { id: string; name: string | null; childName: string | null };

export type TodoItem = TodoCase &
  (
    | { type: "returned"; /** Head Office's reason for sending the case back. */ reason: string | null }
    | { type: "draft"; updatedAt: Date }
    | { type: "due"; number: number; /** "YYYY-MM-DD" */ expectedOn: string; overdue: boolean }
    | { type: "stale"; days: number }
  );

/** HOME-3: an installment being paid shows in the to-do panel from 7 days before its expected day. */
export const DUE_SOON_DAYS = 7;

const TODO_TAKE = 20;

/**
 * HOME-3, in this order: cases sent back, with Head Office's reason; installments being paid whose
 * expected day has passed or is within 7 days; cases in progress with no update for 30 days; drafts.
 */
export async function todoItems(db: PrismaClient, viewer: Viewer, now = new Date()): Promise<TodoItem[]> {
  const scope = officeFilter(viewer);
  if (!scope) return [];
  const today = colomboDay(now);
  const caseFields = { id: true, name: true, childName: true } as const;

  const [returned, due, stale, drafts] = await Promise.all([
    db.case.findMany({
      where: { ...scope, status: "RETURNED" },
      orderBy: { updatedAt: "desc" },
      take: TODO_TAKE,
      select: {
        ...caseFields,
        decisions: { where: { type: "SEND_BACK" }, orderBy: { at: "desc" }, take: 1, select: { reason: true } },
      },
    }),
    db.installment.findMany({
      where: {
        status: "PROCESSING",
        expectedOn: { lte: dayToDate(addDays(today, DUE_SOON_DAYS)) },
        case: { ...scope, status: "IN_PROGRESS" },
      },
      orderBy: [{ expectedOn: "asc" }, { caseId: "asc" }],
      take: TODO_TAKE,
      select: { number: true, expectedOn: true, case: { select: caseFields } },
    }),
    db.case.findMany({
      where: { ...scope, status: "IN_PROGRESS", updatedAt: { lt: staleBefore(now) } },
      orderBy: { updatedAt: "asc" },
      take: TODO_TAKE,
      select: { ...caseFields, updatedAt: true },
    }),
    db.case.findMany({
      where: { ...scope, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      take: TODO_TAKE,
      select: { ...caseFields, updatedAt: true },
    }),
  ]);

  return [
    ...returned.map(({ decisions, ...c }) => ({
      ...c,
      type: "returned" as const,
      reason: decisions[0]?.reason ?? null,
    })),
    ...due.map((i) => {
      const expectedOn = i.expectedOn ? dateToDay(i.expectedOn) : today;
      return { ...i.case, type: "due" as const, number: i.number, expectedOn, overdue: expectedOn < today };
    }),
    ...stale.map(({ updatedAt, ...c }) => ({ ...c, type: "stale" as const, days: daysBetween(updatedAt, now) })),
    ...drafts.map((c) => ({ ...c, type: "draft" as const })),
  ];
}

export type OfficeMoney = { received: number; paidOut: number; balance: number };

/**
 * HOME-4: what the officer's office has received from Head Office (the releases), what it has paid
 * to beneficiaries (the installments marked paid), and the balance it holds.
 */
export async function officeMoney(db: PrismaClient, viewer: Viewer): Promise<OfficeMoney | null> {
  const scope = officeFilter(viewer);
  if (!scope) return null;
  const [received, paid] = await Promise.all([
    db.release.aggregate({ where: { case: scope }, _sum: { amount: true } }),
    db.installment.aggregate({ where: { status: "RELEASED", case: scope }, _sum: { amount: true } }),
  ]);
  const total = received._sum.amount ?? 0;
  const paidOut = paid._sum.amount ?? 0;
  return { received: total, paidOut, balance: total - paidOut };
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
