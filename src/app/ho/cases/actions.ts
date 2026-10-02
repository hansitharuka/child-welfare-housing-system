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

/** Head Office's case actions. Head Office may enter and change cases for any DS office (CASE-3). */

export async function saveCaseAction(_previous: CaseFormState, form: FormData): Promise<CaseFormState> {
  const actor = await requireRole("HO_OFFICER");
  const result = await saveCaseForm(actor, form);
  if (!result.ok) return result.state;

  revalidatePath("/ho/cases");
  const { id, status } = result.saved;
  redirect(status === "SUBMITTED" ? `/ho/cases/${id}?notice=submitted` : `/ho/cases/${id}/edit?notice=saved`);
}

export async function uploadDocumentAction(form: FormData) {
  return uploadFromForm(await requireRole("HO_OFFICER"), form);
}

export async function checkNicAction(nic: string, caseId: string, dsOfficeId: number | null) {
  return nicMatchesFor(await requireRole("HO_OFFICER"), nic, caseId, dsOfficeId);
}

export async function removeDocumentAction(caseId: string, fileId: string) {
  const result = await removeCaseDocument(await requireRole("HO_OFFICER"), caseId, fileId);
  if (!result.error) revalidatePath(`/ho/cases/${caseId}`);
  return result;
}

export async function deleteDraftAction(caseId: string) {
  const result = await deleteCaseDraft(await requireRole("HO_OFFICER"), caseId);
  if (result.error) return result;
  revalidatePath("/ho/cases");
  redirect("/ho/cases?notice=deleted");
}
