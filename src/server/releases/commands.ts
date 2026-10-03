import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { colomboDay, dateToDay, dayToDate } from "@/lib/dates";
import { INSTALLMENT_AMOUNT, INSTALLMENT_COUNT, RELEASE_AMOUNT } from "@/lib/money";
import {
  parseReleaseForm,
  type ReleaseDateLimits,
  type ReleaseErrors,
  type ReleaseField,
  type ReleaseValues,
} from "@/lib/validation/release";
import { writeAudit } from "../audit";
import type { Actor } from "../cases/commands";
import { Refusal } from "../cases/refusal";
import { applyMove, type MoveError, moveRefusal } from "../cases/transitions";
import { canSeeOffice } from "../permissions";

export type ReleaseCommandError = "notFound" | MoveError | "noRelease";

/** A refusal for the whole form (`error`), or for its fields (`errors`), which the form shows next to each. */
export type ReleaseResult = { ok: true } | { ok: false; error: ReleaseCommandError | null; errors: ReleaseErrors };

export type ReleaseInput = {
  caseId: string;
  /** The case's version when the form was shown (CASE-10). */
  version: number;
  /** The form as typed; it is checked here against the case's own dates. */
  form: Record<ReleaseField, string>;
};

const refused = (error: ReleaseCommandError): ReleaseResult => ({ ok: false, error, errors: {} });

function dateLimits(verifiedAt: Date | null, now: Date): ReleaseDateLimits {
  return { earliest: verifiedAt && colomboDay(verifiedAt), today: colomboDay(now) };
}

/**
 * REL-2, REL-3: records the Rs. 2,000,000 release of a verified case. In one transaction the case
 * moves to IN_PROGRESS, the release is saved, its four NOT_STARTED installments of Rs. 500,000 are
 * made, and the DS office's officers are notified (transitions.ts). The amount is never typed in.
 */
export async function recordRelease(db: PrismaClient, actor: Actor, input: ReleaseInput): Promise<ReleaseResult> {
  const found = await db.case.findUnique({
    where: { id: input.caseId },
    select: { id: true, status: true, dsOfficeId: true, version: true, verifiedAt: true },
  });
  if (!found || !canSeeOffice(actor, found.dsOfficeId)) return refused("notFound");
  const refusal = moveRefusal(actor.role, "release", found.status);
  if (refusal) return refused(refusal);

  const now = new Date();
  const parsed = parseReleaseForm((field) => input.form[field], dateLimits(found.verifiedAt, now));
  if (!parsed.ok) return { ok: false, error: null, errors: parsed.errors };
  if (found.version !== input.version) return refused("conflict");
  const release = parsed.value;

  try {
    await db.$transaction(async (tx) => {
      await applyMove(tx, found, "release", {
        by: actor.role,
        actorId: actor.userId,
        at: now,
        checkVersion: true,
        auditAfter: { amount: RELEASE_AMOUNT, ...release },
      });
      await tx.release.create({
        data: {
          id: randomUUID(),
          caseId: found.id,
          releasedOn: dayToDate(release.releasedOn),
          amount: RELEASE_AMOUNT,
          referenceNumber: release.referenceNumber,
          note: release.note,
          byId: actor.userId,
          at: now,
        },
      });
      await tx.installment.createMany({
        data: Array.from({ length: INSTALLMENT_COUNT }, (_, index) => ({
          id: randomUUID(),
          caseId: found.id,
          number: index + 1,
          amount: INSTALLMENT_AMOUNT,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Refusal) return refused(error.reason as MoveError);
    throw error;
  }
  return { ok: true };
}

/**
 * REL-4: Head Office corrects a release's date, reference number or note. The same date rules apply,
 * and the date can't move past an installment date already recorded (INS-3, INS-4). The old and new
 * value of every changed field is logged.
 */
export async function correctRelease(db: PrismaClient, actor: Actor, input: ReleaseInput): Promise<ReleaseResult> {
  const found = await db.case.findUnique({
    where: { id: input.caseId },
    select: {
      id: true,
      dsOfficeId: true,
      version: true,
      verifiedAt: true,
      release: { select: { id: true, releasedOn: true, referenceNumber: true, note: true } },
      installments: { select: { expectedOn: true, releasedOn: true } },
    },
  });
  if (!found || !canSeeOffice(actor, found.dsOfficeId)) return refused("notFound");
  if (actor.role !== "HO_OFFICER") return refused("roleNotAllowed");
  const current = found.release;
  if (!current) return refused("noRelease");

  const parsed = parseReleaseForm((field) => input.form[field], dateLimits(found.verifiedAt, new Date()));
  if (!parsed.ok) return { ok: false, error: null, errors: parsed.errors };
  const next = parsed.value;
  const firstInstallmentDay = found.installments
    .flatMap((i) => [i.expectedOn, i.releasedOn])
    .flatMap((date) => (date ? [dateToDay(date)] : []))
    .sort()[0];
  if (firstInstallmentDay && next.releasedOn > firstInstallmentDay) {
    return { ok: false, error: null, errors: { releasedOn: "dateAfterInstallment" } };
  }
  if (found.version !== input.version) return refused("conflict");

  const before: ReleaseValues = {
    releasedOn: dateToDay(current.releasedOn),
    referenceNumber: current.referenceNumber,
    note: current.note,
  };
  const changed = (Object.keys(next) as (keyof ReleaseValues)[]).filter((field) => next[field] !== before[field]);
  if (changed.length === 0) return { ok: true };
  const pick = (values: ReleaseValues) => Object.fromEntries(changed.map((field) => [field, values[field]]));

  try {
    await db.$transaction(async (tx) => {
      // The case's version goes up too, so a form opened before this correction can't overwrite it.
      const updated = await tx.case.updateMany({
        where: { id: found.id, version: found.version },
        data: { version: { increment: 1 } },
      });
      if (updated.count === 0) throw new Refusal("conflict");
      await tx.release.update({
        where: { id: current.id },
        data: { releasedOn: dayToDate(next.releasedOn), referenceNumber: next.referenceNumber, note: next.note },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: "release_corrected",
        entityType: "release",
        entityId: current.id,
        caseId: found.id,
        before: pick(before),
        after: pick(next),
      });
    });
  } catch (error) {
    if (error instanceof Refusal) return refused("conflict");
    throw error;
  }
  return { ok: true };
}
