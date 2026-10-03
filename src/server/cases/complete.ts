import type { Prisma } from "@/generated/prisma/client";
import type { Kind } from "@/generated/prisma/enums";
import { INSTALLMENT_COUNT } from "@/lib/money";
import { applyMove, type MovingCase } from "./transitions";

/**
 * CLS-1: a case is finished when installment 4 is released and the case has reached the last active
 * stage of its kind. A kind with no active stages (renovation, until its stages are defined) needs
 * only installment 4.
 */
export function isComplete(input: {
  lastInstallmentPaid: boolean;
  lastActiveStageId: number | null;
  reachedStageIds: readonly number[];
}): boolean {
  if (!input.lastInstallmentPaid) return false;
  return input.lastActiveStageId === null || input.reachedStageIds.includes(input.lastActiveStageId);
}

/**
 * Runs the completion rule after an installment or stage change, inside the same transaction, and
 * moves a finished case to COMPLETED as the system (transitions.ts), which also tells the DS office
 * (NTF-1). `current` is the case as it is now inside the transaction. Returns whether it finished.
 */
export async function completeIfDone(
  tx: Prisma.TransactionClient,
  current: MovingCase & { kind: Kind | null },
  at: Date,
): Promise<boolean> {
  if (current.status !== "IN_PROGRESS") return false;
  const last = await tx.installment.findUnique({
    where: { caseId_number: { caseId: current.id, number: INSTALLMENT_COUNT } },
    select: { status: true },
  });
  const lastStage = current.kind
    ? await tx.stageDefinition.findFirst({
        where: { kind: current.kind, active: true },
        orderBy: { sortOrder: "desc" },
        select: { id: true },
      })
    : null;
  const reached = lastStage
    ? await tx.stageUpdate.findMany({ where: { caseId: current.id, stageId: lastStage.id }, select: { stageId: true } })
    : [];
  const done = isComplete({
    lastInstallmentPaid: last?.status === "RELEASED",
    lastActiveStageId: lastStage?.id ?? null,
    reachedStageIds: reached.flatMap((r) => (r.stageId === null ? [] : [r.stageId])),
  });
  if (!done) return false;
  await applyMove(tx, current, "complete", { by: "SYSTEM", actorId: null, at, data: { completedAt: at } });
  return true;
}
