import type { PrismaClient } from "@/generated/prisma/client";
import { nicKey } from "@/lib/nic";
import { IMPORTED_FIELDS, type ImportedValues } from "@/lib/validation/case";
import { writeAudit } from "../audit";
import { canSeeOffice } from "../permissions";
import type { Actor, CaseCommandError } from "./commands";
import { canFillImported } from "./rules";

export type FillImportedInput = {
  id: string;
  /** The version the form was opened with (CASE-10). */
  version: number;
  values: ImportedValues;
};

/**
 * IMP-5: the office fills in the kind of help, NIC and phone numbers of a case brought in from the old
 * sheet, while Head Office hasn't yet confirmed it. Every changed field is logged with its old and new
 * value (HIS-1), as any change to a case is.
 */
export async function fillImported(
  db: PrismaClient,
  actor: Actor,
  input: FillImportedInput,
): Promise<{ ok: true } | { ok: false; error: CaseCommandError }> {
  const current = await db.case.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      dsOfficeId: true,
      status: true,
      version: true,
      kind: true,
      nic: true,
      mobile1: true,
      mobile2: true,
    },
  });
  if (!current || !canSeeOffice(actor, current.dsOfficeId)) return { ok: false, error: "notFound" };
  if (actor.role !== "DS_OFFICER") return { ok: false, error: "roleNotAllowed" };
  if (!canFillImported(actor.role, current.status)) return { ok: false, error: "notEditable" };
  if (current.version !== input.version) return { ok: false, error: "conflict" };

  const changed = IMPORTED_FIELDS.filter((field) => current[field] !== input.values[field]);
  if (changed.length === 0) return { ok: true };
  const pick = (source: Record<string, unknown>) => Object.fromEntries(changed.map((f) => [f, source[f] ?? null]));

  const saved = await db.$transaction(async (tx) => {
    // Head Office may have confirmed it, or someone else saved it, since the form was read.
    const updated = await tx.case.updateMany({
      where: { id: current.id, version: current.version, status: "IMPORTED" },
      data: {
        ...input.values,
        nicKey: input.values.nic ? nicKey(input.values.nic) : null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) return false;
    await writeAudit(tx, {
      actorId: actor.userId,
      action: "case_updated",
      entityType: "case",
      entityId: current.id,
      caseId: current.id,
      before: pick(current),
      after: pick(input.values),
    });
    return true;
  });
  return saved ? { ok: true } : { ok: false, error: "conflict" };
}
