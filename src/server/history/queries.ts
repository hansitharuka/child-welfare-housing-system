import type { PrismaClient } from "@/generated/prisma/client";
import { isRole, type Role } from "../auth/roles";
import { canSeeOffice, type Viewer } from "../permissions";

export type HistoryEntry = {
  id: string;
  at: Date;
  /** The audit action, such as "case_submitted" or "installment_paid". */
  action: string;
  /** Who did it; null for something the system did by itself, such as finishing a case (CLS-1). */
  actor: { name: string; role: Role | null } | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * HIS-2: everything recorded about a case, newest first, from the audit log (HIS-1), with the name
 * and role of whoever did each step. Null when the viewer may not see the case (PRM-1).
 */
export async function caseHistory(db: PrismaClient, viewer: Viewer, caseId: string): Promise<HistoryEntry[] | null> {
  const found = await db.case.findUnique({ where: { id: caseId }, select: { dsOfficeId: true } });
  if (!found || !canSeeOffice(viewer, found.dsOfficeId)) return null;

  const rows = await db.auditLog.findMany({
    where: { caseId },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    select: { id: true, at: true, action: true, actorId: true, before: true, after: true },
  });
  const actorIds = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(actors.map((a) => [a.id, { name: a.name, role: isRole(a.role) ? a.role : null }]));

  return rows.map((row) => ({
    id: String(row.id),
    at: row.at,
    action: row.action,
    actor: row.actorId ? (byId.get(row.actorId) ?? null) : null,
    before: asObject(row.before),
    after: asObject(row.after),
  }));
}
