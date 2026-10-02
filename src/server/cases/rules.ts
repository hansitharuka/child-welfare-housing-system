import type { CaseStatus } from "@/generated/prisma/enums";
import type { Role } from "../auth/roles";

/**
 * Who may change a case, and when (SPEC section 4 and section 6). Office scope is checked separately,
 * through the permission layer; these rules only look at the role and the case's status.
 */
const EDITABLE: readonly CaseStatus[] = ["DRAFT", "RETURNED"];

const entersCases = (role: Role) => role === "DS_OFFICER" || role === "HO_OFFICER";

/**
 * A draft or a returned case can be changed by its office or by Head Office (CASE-7). Nobody changes
 * a case while Head Office is checking it (STS-3). Head Office's edits after verification come in Phase 5 (CASE-9).
 */
export function canEditDetails(role: Role, status: CaseStatus): boolean {
  return entersCases(role) && EDITABLE.includes(status);
}

/** The statuses canEditDetails() allows, for a query that must not change anything else. */
export const EDITABLE_STATUSES = EDITABLE;

/** A draft can be deleted (CASE-8), by its office or by Head Office, who may also start drafts. */
export function canDeleteDraft(role: Role, status: CaseStatus): boolean {
  return entersCases(role) && status === "DRAFT";
}

/**
 * Only Head Office chooses a case's office (CASE-3), and only while it is a draft: the first submit
 * puts the office's code into the case number.
 */
export function canChangeOffice(role: Role, status: CaseStatus | null): boolean {
  return role === "HO_OFFICER" && (status === null || status === "DRAFT");
}
