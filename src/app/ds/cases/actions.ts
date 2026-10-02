"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CaseFormState } from "@/components/forms/case-form";
import { requireRole } from "@/server/context";
import {
  deleteCaseDraft,
  nicMatchesFor,
  removeCaseDocument,
  saveCaseForm,
  uploadFromForm,
} from "@/server/cases/form-actions";

/** The DS officer's case actions. Each checks the role, then the office rules apply in the server layer. */

export async function saveCaseAction(_previous: CaseFormState, form: FormData): Promise<CaseFormState> {
  const actor = await requireRole("DS_OFFICER");
  const result = await saveCaseForm(actor, form);
  if (!result.ok) return result.state;

  revalidatePath("/ds");
  const { id, status } = result.saved;
  redirect(status === "SUBMITTED" ? `/ds/cases/${id}?notice=submitted` : `/ds/cases/${id}/edit?notice=saved`);
}

export async function uploadDocumentAction(form: FormData) {
  return uploadFromForm(await requireRole("DS_OFFICER"), form);
}

export async function checkNicAction(nic: string, caseId: string, dsOfficeId: number | null) {
  return nicMatchesFor(await requireRole("DS_OFFICER"), nic, caseId, dsOfficeId);
}

export async function removeDocumentAction(caseId: string, fileId: string) {
  const result = await removeCaseDocument(await requireRole("DS_OFFICER"), caseId, fileId);
  if (!result.error) revalidatePath(`/ds/cases/${caseId}`);
  return result;
}

export async function deleteDraftAction(caseId: string) {
  const result = await deleteCaseDraft(await requireRole("DS_OFFICER"), caseId);
  if (result.error) return result;
  revalidatePath("/ds");
  redirect("/ds?notice=deleted");
}
