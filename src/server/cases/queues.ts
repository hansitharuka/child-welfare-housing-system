import type { PrismaClient } from "@/generated/prisma/client";
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
