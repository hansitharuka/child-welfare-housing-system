import type { Prisma } from "@/generated/prisma/client";
import type { CaseStatus } from "@/generated/prisma/enums";
import { Refusal } from "./refusal";

/**
 * Takes a case for a change made from its page (CASE-10, ERR-3). Its version goes up by one, but only
 * while it still has the version the page showed and a status that allows the change; otherwise the
 * change is refused with "conflict" and the caller's transaction rolls back. The case's row then stays
 * locked until the transaction ends, so two changes to one case take turns. The case's last update
 * moves to now, which is how the "no update for 30 days" lists see it (HOME-3, DSH-1).
 */
export async function claimCase(
  tx: Prisma.TransactionClient,
  current: { id: string; version: number },
  statuses: readonly CaseStatus[],
): Promise<void> {
  const claimed = await tx.case.updateMany({
    where: { id: current.id, version: current.version, status: { in: [...statuses] } },
    data: { version: { increment: 1 } },
  });
  if (claimed.count === 0) throw new Refusal("conflict");
}
