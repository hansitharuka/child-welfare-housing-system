"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RELEASE_FIELDS, type ReleaseErrors, type ReleaseField } from "@/lib/validation/release";
import { type DecideError, decideCase, type Decision, isDecision } from "@/server/cases/decide";
import type { Queue } from "@/server/cases/queues";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { correctRelease, recordRelease, type ReleaseCommandError } from "@/server/releases/commands";

/** Head Office's check and release actions (CHK-3, REL-2 to REL-4). Each checks the role first. */

export type DecisionState = { error: DecideError | null };
export type ReleaseState = { error: ReleaseCommandError | null; errors: ReleaseErrors };

/** The notice each change leaves on the next page, by its key under "review.notices". */
const NOTICE: Record<Decision, string> = { verify: "verified", sendBack: "sentBack", reject: "rejected" };

const read = (form: FormData, field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
};

/** The case and the version the screen showed; anything else the form never sends reads as not found. */
function target(form: FormData): { caseId: string; version: number } | null {
  const caseId = read(form, "caseId");
  const version = Number(read(form, "version"));
  return caseId.length > 0 && caseId.length <= 64 && Number.isInteger(version) ? { caseId, version } : null;
}

/**
 * After a change: back to the queue it was made from, with the next case selected, or to the case's
 * own page. The notice names the case by its id, never by personal details (SEC-8).
 */
function goOn(form: FormData, queue: Queue, caseId: string, notice: string): never {
  // The menu's waiting counts live in the layout (NTF-1).
  revalidatePath("/ho", "layout");
  redirect(
    read(form, "from") === "case"
      ? `/ho/cases/${caseId}?notice=${notice}`
      : `/ho/${queue}?notice=${notice}&done=${caseId}`,
  );
}

export async function decideAction(_previous: DecisionState, form: FormData): Promise<DecisionState> {
  const actor = await requireRole("HO_OFFICER");
  const decision = read(form, "decision");
  const chosen = target(form);
  if (!chosen || !isDecision(decision)) return { error: "notFound" };

  const result = await decideCase(db, actor, { ...chosen, decision, reason: read(form, "reason") });
  if (!result.ok) return { error: result.error };
  goOn(form, "check", chosen.caseId, NOTICE[decision]);
}

const releaseForm = (form: FormData) =>
  Object.fromEntries(RELEASE_FIELDS.map((field) => [field, read(form, field)])) as Record<ReleaseField, string>;

export async function releaseAction(_previous: ReleaseState, form: FormData): Promise<ReleaseState> {
  const actor = await requireRole("HO_OFFICER");
  const chosen = target(form);
  if (!chosen) return { error: "notFound", errors: {} };

  const result = await recordRelease(db, actor, { ...chosen, form: releaseForm(form) });
  if (!result.ok) return { error: result.error, errors: result.errors };
  goOn(form, "release", chosen.caseId, "released");
}

export async function correctReleaseAction(_previous: ReleaseState, form: FormData): Promise<ReleaseState> {
  const actor = await requireRole("HO_OFFICER");
  const chosen = target(form);
  if (!chosen) return { error: "notFound", errors: {} };

  const result = await correctRelease(db, actor, { ...chosen, form: releaseForm(form) });
  if (!result.ok) return { error: result.error, errors: result.errors };
  revalidatePath(`/ho/cases/${chosen.caseId}`);
  redirect(`/ho/cases/${chosen.caseId}?notice=corrected`);
}
