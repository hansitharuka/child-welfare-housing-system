import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseStatus } from "@/generated/prisma/enums";
import { colomboDay, colomboYear, dayToDate } from "@/lib/dates";
import { INSTALLMENT_AMOUNT, RELEASE_AMOUNT } from "@/lib/money";
import {
  type ConfirmErrors,
  type ConfirmField,
  NEEDS_KIND,
  OUTCOME_STATUS,
  parseConfirmForm,
} from "@/lib/validation/confirm";
import { canSeeOffice } from "../permissions";
import type { Actor } from "./commands";
import { completeIfDone } from "./complete";
import { nextCaseNumber } from "./numbers";
import { isUniqueViolation, Refusal } from "./refusal";
import { applyMove, type MoveError, moveRefusal } from "./transitions";

export type ConfirmError =
  | "notFound"
  | MoveError
  /** Approving it or recording its progress needs the kind of help, which its office fills in first. */
  | "kindMissing";

/** A refusal for the whole form (`error`), or for its fields (`errors`), which the form shows next to each. */
export type ConfirmResult =
  { ok: true; status: CaseStatus } | { ok: false; error: ConfirmError | null; errors: ConfirmErrors };

export type ConfirmInput = {
  caseId: string;
  /** The case's version when the form was shown (CASE-10). */
  version: number;
  /** The form as typed; it is checked here. */
  form: Record<ConfirmField, string>;
};

const refused = (error: ConfirmError): ConfirmResult => ({ ok: false, error, errors: {} });

/**
 * IMP-5: Head Office confirms a case brought in from the old sheet as what it really is now. The case
 * gets its case number (CASE-5), and in one transaction:
 * - approved: it waits in the release queue from today (REL-1)
 * - in progress: the Rs. 2,000,000 release and the four installments are saved as the sheet and Head
 *   Office's records show them, and a renovation with no stages whose last installment is paid is
 *   completed at once (CLS-1)
 * - rejected or stopped: with a reason, as CHK-3 and CLS-2 have. A stopped one has no release; a case
 *   whose money went out before it stopped is confirmed as in progress, then stopped.
 * The DS office isn't told: nothing changed for it but the status (SPEC section 6).
 */
export async function confirmImported(db: PrismaClient, actor: Actor, input: ConfirmInput): Promise<ConfirmResult> {
  const found = await db.case.findUnique({
    where: { id: input.caseId },
    select: { id: true, status: true, dsOfficeId: true, version: true, kind: true },
  });
  if (!found || !canSeeOffice(actor, found.dsOfficeId)) return refused("notFound");
  const early = moveRefusal(actor.role, "confirmImport", found.status);
  if (early) return refused(early);

  const now = new Date();
  const parsed = parseConfirmForm((field) => input.form[field], colomboDay(now));
  if (!parsed.ok) return { ok: false, error: null, errors: parsed.errors };
  const confirm = parsed.value;
  if (NEEDS_KIND.includes(confirm.outcome) && !found.kind) return refused("kindMissing");
  if (found.version !== input.version) return refused("conflict");
  const to = OUTCOME_STATUS[confirm.outcome];

  // A first case number of a year can meet another one at the counter; one try again is enough (CASE-5).
  for (let attempt = 1; ; attempt += 1) {
    try {
      const status = await db.$transaction(async (tx): Promise<CaseStatus> => {
        const caseNumber = await nextCaseNumber(tx, found.dsOfficeId, colomboYear(now));
        // HIS-1: what was recorded for the money, as the release and installment changes log it.
        const money: Record<string, Prisma.InputJsonValue> =
          confirm.outcome === "inProgress"
            ? { release: { amount: RELEASE_AMOUNT, ...confirm.release }, installments: confirm.installments }
            : {};
        await applyMove(tx, found, "confirmImport", {
          by: actor.role,
          actorId: actor.userId,
          at: now,
          to,
          reason: "reason" in confirm ? confirm.reason : null,
          checkVersion: true,
          // The sheet has no verification date; only a case approved now waits for its release from today.
          data: { caseNumber, ...(confirm.outcome === "verified" ? { verifiedAt: now } : {}) },
          auditAfter: { caseNumber, ...money },
        });
        if (confirm.outcome !== "inProgress") return to;

        await tx.release.create({
          data: {
            id: randomUUID(),
            caseId: found.id,
            releasedOn: dayToDate(confirm.release.releasedOn),
            amount: RELEASE_AMOUNT,
            referenceNumber: confirm.release.referenceNumber,
            note: confirm.release.note,
            byId: actor.userId,
            at: now,
          },
        });
        await tx.installment.createMany({
          data: confirm.installments.map((item) => ({
            id: randomUUID(),
            caseId: found.id,
            number: item.number,
            amount: INSTALLMENT_AMOUNT,
            status: item.status,
            expectedOn: item.expectedOn ? dayToDate(item.expectedOn) : null,
            releasedOn: item.releasedOn ? dayToDate(item.releasedOn) : null,
          })),
        });
        const moved = { id: found.id, status: to, dsOfficeId: found.dsOfficeId, version: found.version + 1 };
        return (await completeIfDone(tx, { ...moved, kind: found.kind }, now)) ? "COMPLETED" : to;
      });
      return { ok: true, status };
    } catch (error) {
      if (error instanceof Refusal) return refused(error.reason as MoveError);
      if (isUniqueViolation(error) && attempt < 3) continue;
      throw error;
    }
  }
}
