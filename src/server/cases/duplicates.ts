import type { PrismaClient } from "@/generated/prisma/client";
import { nicKey } from "@/lib/nic";
import { caseScope, type Viewer } from "../permissions";

/**
 * Another case with the same NIC. What it shows depends on who asks (CASE-6):
 * - a DS officer sees the case number and name of a case in their own office,
 * - and only the case number and office of a case elsewhere;
 * - Head Office sees all three (CHK-2).
 * A draft has no case number yet.
 */
export type NicMatch = { caseNumber: string | null; name: string | null; officeName: string | null };

/**
 * CASE-6: other cases with the same NIC, in either format, so 880001234V matches 198800001234.
 * Drafts count only in the case's own office; elsewhere they have no number to show. The warning
 * never blocks saving or submitting.
 */
export async function findNicMatches(
  db: PrismaClient,
  viewer: Viewer,
  input: { nic: string; dsOfficeId: number | null; exceptCaseId: string | null },
): Promise<NicMatch[]> {
  const scope = caseScope(viewer);
  const key = nicKey(input.nic);
  if (scope.kind === "none" || !key) return [];

  const ownOffice = scope.kind === "office" ? scope.dsOfficeId : input.dsOfficeId;
  const rows = await db.case.findMany({
    where: {
      nicKey: key,
      ...(input.exceptCaseId ? { id: { not: input.exceptCaseId } } : {}),
      OR: [{ status: { not: "DRAFT" } }, ...(ownOffice !== null ? [{ dsOfficeId: ownOffice }] : [])],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { caseNumber: true, name: true, dsOfficeId: true, dsOffice: { select: { nameSi: true } } },
  });

  return rows.map((row) => {
    if (scope.kind === "all") return { caseNumber: row.caseNumber, name: row.name, officeName: row.dsOffice.nameSi };
    return row.dsOfficeId === scope.dsOfficeId
      ? { caseNumber: row.caseNumber, name: row.name, officeName: null }
      : { caseNumber: row.caseNumber, name: null, officeName: row.dsOffice.nameSi };
  });
}
