import type { CaseStatus } from "@/generated/prisma/enums";
import { IMPORTED_NEEDS } from "@/lib/validation/case";
import type { Role } from "../auth/roles";

/**
 * Who may change a case's details, and when (SPEC section 4 and section 6). Office scope is checked
 * separately, through the permission layer; these rules only look at the role and the case's status.
 * Status changes themselves are in transitions.ts.
 */
const ENTRY: readonly CaseStatus[] = ["DRAFT", "RETURNED"];

/** CASE-9: after the check, only Head Office changes the details, while the case is still running. */
const AFTER_CHECK: readonly CaseStatus[] = ["VERIFIED", "IN_PROGRESS"];

const EDITABLE: Record<Role, readonly CaseStatus[]> = {
  DS_OFFICER: ENTRY,
  HO_OFFICER: [...ENTRY, ...AFTER_CHECK],
  ADMIN: [],
};

/**
 * A draft or a returned case can be changed by its office or by Head Office (CASE-7). Nobody changes
 * a case while Head Office is checking it (STS-3). After verification only Head Office can, and every
 * changed field is logged (CASE-9). A finished, rejected or stopped case can't be changed.
 */
export function canEditDetails(role: Role, status: CaseStatus): boolean {
  return EDITABLE[role].includes(status);
}

/** The statuses canEditDetails() allows a role, for a query that must not change anything else. */
export function editableStatuses(role: Role): readonly CaseStatus[] {
  return EDITABLE[role];
}

/**
 * IMP-5: until Head Office confirms a case brought in from the old sheet, its office may fill in the
 * kind of help, the NIC and the phone numbers, and nothing else.
 */
export function canFillImported(role: Role, status: CaseStatus): boolean {
  return role === "DS_OFFICER" && status === "IMPORTED";
}

/** IMP-4: what an imported case still lacks of what its office fills in; nothing once it is confirmed. */
export function missingImported(
  found: { status: CaseStatus } & Record<(typeof IMPORTED_NEEDS)[number], unknown>,
): (typeof IMPORTED_NEEDS)[number][] {
  return found.status === "IMPORTED" ? IMPORTED_NEEDS.filter((field) => !found[field]) : [];
}

/** A case still being entered opens in its form; any other opens on its page. */
export function isBeingEntered(status: CaseStatus): boolean {
  return ENTRY.includes(status);
}

/** A case Head Office has verified must keep every required field filled in (CASE-9). */
export function mustStayComplete(status: CaseStatus): boolean {
  return AFTER_CHECK.includes(status);
}

/** A draft can be deleted (CASE-8), by its office or by Head Office, who may also start drafts. */
export function canDeleteDraft(role: Role, status: CaseStatus): boolean {
  return (role === "DS_OFFICER" || role === "HO_OFFICER") && status === "DRAFT";
}

/**
 * Only Head Office chooses a case's office (CASE-3), and only while it is a draft: the first submit
 * puts the office's code into the case number.
 */
export function canChangeOffice(role: Role, status: CaseStatus | null): boolean {
  return role === "HO_OFFICER" && (status === null || status === "DRAFT");
}
