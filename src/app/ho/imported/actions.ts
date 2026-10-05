"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CONFIRM_FIELDS, type ConfirmErrors, type ConfirmField } from "@/lib/validation/confirm";
import { type ConfirmError, confirmImported } from "@/server/cases/confirm-import";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";

/** Head Office confirms a case brought in from the old sheet (IMP-5). It checks the role first. */

export type ConfirmState = { error: ConfirmError | null; errors: ConfirmErrors };

const read = (form: FormData, field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
};

export async function confirmImportAction(_previous: ConfirmState, form: FormData): Promise<ConfirmState> {
  const actor = await requireRole("HO_OFFICER");
  const caseId = read(form, "caseId");
  const version = Number(read(form, "version"));
  if (caseId.length === 0 || caseId.length > 64 || !Number.isInteger(version)) return { error: "notFound", errors: {} };

  const fields = Object.fromEntries(CONFIRM_FIELDS.map((field) => [field, read(form, field)]));
  const result = await confirmImported(db, actor, { caseId, version, form: fields as Record<ConfirmField, string> });
  if (!result.ok) return { error: result.error, errors: result.errors };

  // The menu's entry and the queues it may join live in the layout.
  revalidatePath("/ho", "layout");
  if (read(form, "from") === "case") redirect(`/ho/cases/${caseId}?notice=confirmed`);
  // Back to the list with the next case chosen, in the district it was showing. URLs hold ids only (SEC-8).
  const districtId = read(form, "districtId");
  const district = /^\d{1,9}$/.test(districtId) ? `&districtId=${districtId}` : "";
  redirect(`/ho/imported?notice=confirmed&done=${caseId}${district}`);
}
