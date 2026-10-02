import type { Prisma } from "@/generated/prisma/client";

/** CASE-5: {DS code}-{year}-{NNN}, for example HMG-2026-011. NNN has at least 3 digits. */
export function formatCaseNumber(officeCode: string, year: number, sequence: number): string {
  return `${officeCode}-${year}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Takes the next case number of a DS office for the year. Call it inside the transaction that submits
 * the case: the counter row stays locked until that transaction ends, so two submits at the same moment
 * take turns, and a submit that fails gives its number back. The very first number of a year can still
 * meet another first one; that shows as a unique-key error, and the caller tries again.
 */
export async function nextCaseNumber(tx: Prisma.TransactionClient, dsOfficeId: number, year: number): Promise<string> {
  const office = await tx.dsOffice.findUniqueOrThrow({ where: { id: dsOfficeId }, select: { code: true } });
  const counter = await tx.caseNumberCounter.upsert({
    where: { dsOfficeId_year: { dsOfficeId, year } },
    create: { dsOfficeId, year, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return formatCaseNumber(office.code, year, counter.last);
}
