import type { Prisma } from "@/generated/prisma/client";

export type AuditEntry = {
  /** The signed-in user, or null for something the system did by itself. */
  actorId: string | null;
  /** What happened, as a short code such as "password_changed" or "case_submitted". */
  action: string;
  entityType: string;
  entityId: string;
  caseId?: string | null;
  /** Old values of the fields that changed. */
  before?: Prisma.InputJsonValue;
  /** New values of the fields that changed. */
  after?: Prisma.InputJsonValue;
};

/**
 * Writes one audit record (HIS-1). Always call it with the same transaction as the change it
 * describes (ARC-4): if the change rolls back, so does its record. The database refuses any later
 * update or delete of the record (HIS-3).
 */
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      caseId: entry.caseId ?? null,
      before: entry.before,
      after: entry.after,
    },
  });
}
