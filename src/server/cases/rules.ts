import type { CaseStatus } from "@/generated/prisma/enums";
import {
  type CaseField,
  type CaseValues,
  CONFIRMED_NEEDS,
  IMPORTED_FIELDS,
  IMPORTED_NEEDS,
  type ImportedField,
  missingRequired,
} from "@/lib/validation/case";
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

/** A case, as the rules for the old sheet's cases see it (IMP-4, IMP-5). */
export type SheetCase = { status: CaseStatus; fromSheet: boolean } & Record<ImportedField, unknown>;

/**
 * IMP-5: what the office may fill in on a case brought in from the old sheet.
 * - Until Head Office confirms it: the kind of help, the NIC and the phone numbers.
 * - Once confirmed, while it is verified or in progress: a NIC or phone numbers the case still lacks,
 *   so the office can go on filling them in. The kind stays as confirmed, and what is filled in is
 *   changed by Head Office (CASE-9).
 * Anyone else, or a case entered in the system, gets nothing.
 */
export function fillableFields(role: Role, found: SheetCase): ImportedField[] {
  if (role !== "DS_OFFICER") return [];
  if (found.status === "IMPORTED") return [...IMPORTED_FIELDS];
  if (!found.fromSheet || !AFTER_CHECK.includes(found.status)) return [];
  return [...(found.nic ? [] : (["nic"] as const)), ...(found.mobile1 ? [] : (["mobile1", "mobile2"] as const))];
}

export function canFillImported(role: Role, found: SheetCase): boolean {
  return fillableFields(role, found).length > 0;
}

/** What a case from the sheet still lacks of what its office fills in (IMP-4); nothing for any other case. */
export function missingImported(
  found: Pick<SheetCase, "status" | "fromSheet"> & Record<(typeof IMPORTED_NEEDS)[number], unknown>,
): (typeof IMPORTED_NEEDS)[number][] {
  if (found.status === "IMPORTED") return IMPORTED_NEEDS.filter((field) => !found[field]);
  if (found.fromSheet && AFTER_CHECK.includes(found.status)) return CONFIRMED_NEEDS.filter((field) => !found[field]);
  return [];
}

/** A case still being entered opens in its form; any other opens on its page. */
export function isBeingEntered(status: CaseStatus): boolean {
  return ENTRY.includes(status);
}

/** A case Head Office has verified must keep every required field filled in (CASE-9). */
export function mustStayComplete(status: CaseStatus): boolean {
  return AFTER_CHECK.includes(status);
}

/**
 * CASE-9, IMP-4: the required fields that may stay empty when Head Office changes a verified case. On a
 * case from the old sheet, those the sheet left empty (a child's name) may stay so, until someone knows
 * them; a filled one can't be emptied. A case entered in the system has every one filled in already.
 */
export function mayStayEmpty(found: { fromSheet: boolean } & CaseValues): CaseField[] {
  return found.fromSheet ? (Object.keys(missingRequired(found)) as CaseField[]) : [];
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
