import type { CaseFormState } from "@/components/forms/case-form";
import { db } from "../db";
import { type UploadedFile, type UploadError, uploadDocument } from "../files/uploads";
import { type Actor, type CaseCommandError, deleteDraft, removeDocument, type SavedCase, saveCase } from "./commands";
import { findNicMatches, type NicMatch } from "./duplicates";
import { readCaseForm } from "./form-data";

/**
 * What the DS and Head Office case actions share. Each role's actions.ts checks the role first
 * (requireRole), then calls these, then sends the user to its own pages.
 */

/** Reads and saves the case form (CASE-1 to CASE-7). */
export async function saveCaseForm(
  actor: Actor,
  form: FormData,
): Promise<{ ok: true; saved: SavedCase } | { ok: false; state: CaseFormState }> {
  const read = readCaseForm(form);
  if (!read.ok) {
    return {
      ok: false,
      state: "errors" in read ? { errors: read.errors, error: null } : { errors: {}, error: "notFound" },
    };
  }
  const result = await saveCase(db, actor, read.input);
  if (!result.ok) return { ok: false, state: { errors: {}, error: result.error } };
  return { ok: true, saved: result.value };
}

/** Stores one uploaded document (CASE-2, ERR-5). */
export async function uploadFromForm(
  actor: Actor,
  form: FormData,
): Promise<{ ok: true; value: UploadedFile } | { ok: false; error: UploadError }> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "fileEmpty" };
  return uploadDocument(db, actor, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
}

/** CASE-6. The arguments come from the browser, so each one is checked before use. */
export async function nicMatchesFor(
  actor: Actor,
  nic: unknown,
  caseId: unknown,
  dsOfficeId: unknown,
): Promise<NicMatch[]> {
  if (typeof nic !== "string" || nic.length > 20) return [];
  return findNicMatches(db, actor, {
    nic,
    exceptCaseId: typeof caseId === "string" && caseId.length <= 36 ? caseId : null,
    dsOfficeId: typeof dsOfficeId === "number" && Number.isInteger(dsOfficeId) ? dsOfficeId : null,
  });
}

export async function removeCaseDocument(
  actor: Actor,
  caseId: unknown,
  fileId: unknown,
): Promise<{ error: CaseCommandError | null }> {
  if (typeof caseId !== "string" || typeof fileId !== "string") return { error: "notFound" };
  const result = await removeDocument(db, actor, caseId, fileId);
  return { error: result.ok ? null : result.error };
}

export async function deleteCaseDraft(actor: Actor, caseId: unknown): Promise<{ error: CaseCommandError | null }> {
  if (typeof caseId !== "string") return { error: "notFound" };
  const result = await deleteDraft(db, actor, caseId);
  return { error: result.ok ? null : result.error };
}
