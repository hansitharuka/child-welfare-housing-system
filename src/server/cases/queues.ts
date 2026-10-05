import type { PrismaClient } from "@/generated/prisma/client";
import type { Category } from "@/generated/prisma/enums";
import { officeFilter, type Viewer } from "../permissions";
import { duplicateFlags } from "./duplicates";
import { PAGE_SIZE } from "./queries";

/** Head Office's two queues (CHK-1, REL-1): cases to check, then cases to release money for. */
export type Queue = "check" | "release";

export type QueueRow = {
  id: string;
  caseNumber: string | null;
  name: string | null;
  childName: string | null;
  officeName: string;
  /** Sent for checking, or verified: the queue's oldest comes first. */
  waitingSince: Date | null;
  /** The NIC is on another case too (CHK-1). Only the check queue looks. */
  duplicate: boolean;
};

const STATUS = { check: "SUBMITTED", release: "VERIFIED" } as const;

/**
 * One page of a queue, the longest waiting first: by submission for the check (CHK-1) and by
 * verification for the release (REL-1). Only Head Office has queues; anyone else gets none.
 */
export async function listQueue(
  db: PrismaClient,
  viewer: Viewer,
  queue: Queue,
  page: number,
): Promise<{ rows: QueueRow[]; total: number }> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return { rows: [], total: 0 };
  const where = { ...scope, status: STATUS[queue] };
  const since = queue === "check" ? "submittedAt" : "verifiedAt";

  const [found, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ [since]: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        caseNumber: true,
        name: true,
        childName: true,
        nicKey: true,
        dsOfficeId: true,
        submittedAt: true,
        verifiedAt: true,
        dsOffice: { select: { nameSi: true } },
      },
    }),
    db.case.count({ where }),
  ]);
  const flagged = queue === "check" ? await duplicateFlags(db, found) : new Set<string>();

  return {
    rows: found.map((row) => ({
      id: row.id,
      caseNumber: row.caseNumber,
      name: row.name,
      childName: row.childName,
      officeName: row.dsOffice.nameSi,
      waitingSince: row[since],
      duplicate: flagged.has(row.id),
    })),
    total,
  };
}

/** How many cases wait in each queue, for the tabs and the menu (NTF-1). */
export async function queueCounts(db: PrismaClient, viewer: Viewer): Promise<Record<Queue, number>> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return { check: 0, release: 0 };
  const [check, release] = await Promise.all([
    db.case.count({ where: { ...scope, status: STATUS.check } }),
    db.case.count({ where: { ...scope, status: STATUS.release } }),
  ]);
  return { check, release };
}

export type ImportedRow = {
  id: string;
  name: string | null;
  childName: string | null;
  category: Category | null;
  officeName: string;
  /** Where it was on its tab of the sheet (IMP-7). */
  sheetRow: number | null;
  sheetSerial: number | null;
  /** Approving it or recording its progress waits for its office to fill in the kind of help (IMP-5). */
  kindMissing: boolean;
};

/**
 * IMP-5: one page of the cases from the old sheet that Head Office hasn't confirmed yet, in the
 * sheet's own order (its care leavers' tab, then its children's), so the sheet can be followed beside
 * it. A district narrows the list. Only Head Office confirms; anyone else gets none.
 */
export async function listImported(
  db: PrismaClient,
  viewer: Viewer,
  options: { page: number; districtId?: number },
): Promise<{ rows: ImportedRow[]; total: number }> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return { rows: [], total: 0 };
  const where = {
    ...scope,
    status: "IMPORTED" as const,
    ...(options.districtId ? { dsOffice: { districtId: options.districtId } } : {}),
  };
  const [found, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ category: "asc" }, { sheetRow: "asc" }, { id: "asc" }],
      skip: (Math.max(1, options.page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        childName: true,
        category: true,
        kind: true,
        sheetRow: true,
        sheetSerial: true,
        dsOffice: { select: { nameSi: true } },
      },
    }),
    db.case.count({ where }),
  ]);
  return {
    rows: found.map(({ dsOffice, kind, ...row }) => ({ ...row, officeName: dsOffice.nameSi, kindMissing: !kind })),
    total,
  };
}

/** The districts that still have cases from the sheet to confirm, with how many, for the list's filter. */
export async function importedByDistrict(
  db: PrismaClient,
  viewer: Viewer,
): Promise<{ id: number; name: string; count: number }[]> {
  if (viewer.role !== "HO_OFFICER" || !officeFilter(viewer)) return [];
  const waiting = { status: "IMPORTED" } as const;
  const districts = await db.district.findMany({
    where: { dsOffices: { some: { cases: { some: waiting } } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      nameSi: true,
      dsOffices: { select: { _count: { select: { cases: { where: waiting } } } } },
    },
  });
  return districts.map((d) => ({
    id: d.id,
    name: d.nameSi,
    count: d.dsOffices.reduce((sum, office) => sum + office._count.cases, 0),
  }));
}

/** How many cases from the sheet wait for Head Office to confirm them (IMP-5), for the menu. */
export async function importedCount(db: PrismaClient, viewer: Viewer): Promise<number> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return 0;
  return db.case.count({ where: { ...scope, status: "IMPORTED" } });
}

/**
 * The menu's count (NTF-1): both queues together, with when they were read, so the screen can tell
 * which of two readings is newer (src/components/shell/live-count.ts).
 */
export async function waitingNow(db: PrismaClient, viewer: Viewer): Promise<{ count: number; at: number }> {
  const at = Date.now();
  const { check, release } = await queueCounts(db, viewer);
  return { count: check + release, at };
}
