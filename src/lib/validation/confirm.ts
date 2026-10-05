import { parseReason, type ReasonErrorKey } from "./decision";
import { type DayError, dayProblem, paidLimits, startLimits } from "./progress";
import { parseReleaseForm, RELEASE_FIELDS, type ReleaseErrorKey, type ReleaseValues } from "./release";

/**
 * IMP-5: Head Office confirms a case brought in from the old sheet as what it really is now. The form
 * is checked the same way in the browser and on the server. Error messages are keys under
 * "imported.errors" in messages/si.json.
 */

export const OUTCOMES = ["verified", "inProgress", "rejected", "stopped"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** The status each outcome gives the case (SPEC section 6). */
export const OUTCOME_STATUS = {
  verified: "VERIFIED",
  inProgress: "IN_PROGRESS",
  rejected: "REJECTED",
  stopped: "STOPPED",
} as const satisfies Record<Outcome, string>;

/** Approving the case or recording its progress needs its kind of help, which decides its stages (LST-4). */
export const NEEDS_KIND: readonly Outcome[] = ["verified", "inProgress"];

/** Rejecting or stopping it needs a reason, as CHK-3 and CLS-2 do. */
export const NEEDS_REASON: readonly Outcome[] = ["rejected", "stopped"];

export const INSTALLMENT_STATUSES = ["NOT_STARTED", "PROCESSING", "RELEASED"] as const;
export type InstallmentStatusValue = (typeof INSTALLMENT_STATUSES)[number];

export const INSTALLMENT_NUMBERS = [1, 2, 3, 4] as const satisfies readonly number[];
export type InstallmentNumber = (typeof INSTALLMENT_NUMBERS)[number];

type InstallmentField = `status${InstallmentNumber}` | `day${InstallmentNumber}`;
export const CONFIRM_FIELDS = [
  "outcome",
  "reason",
  ...RELEASE_FIELDS,
  ...INSTALLMENT_NUMBERS.flatMap((n) => [`status${n}`, `day${n}`] as const),
] as const satisfies readonly ("outcome" | "reason" | (typeof RELEASE_FIELDS)[number] | InstallmentField)[];
export type ConfirmField = (typeof CONFIRM_FIELDS)[number];

export type ConfirmErrorKey =
  | "outcomeRequired"
  /** An installment can't be under way or paid while an earlier one isn't paid (INS-2). */
  | "notInOrder"
  | ReasonErrorKey
  | ReleaseErrorKey
  | DayError;
export type ConfirmErrors = Partial<Record<ConfirmField, ConfirmErrorKey>>;

export type ConfirmedInstallment = {
  number: InstallmentNumber;
  status: InstallmentStatusValue;
  /** "YYYY-MM-DD", while its payment is under way (INS-3). */
  expectedOn: string | null;
  /** "YYYY-MM-DD", once paid (INS-4). */
  releasedOn: string | null;
};

export type ConfirmValues =
  | { outcome: "verified" }
  | { outcome: "rejected" | "stopped"; reason: string }
  | { outcome: "inProgress"; release: ReleaseValues; installments: ConfirmedInstallment[] };

const isOutcome = (value: string): value is Outcome => (OUTCOMES as readonly string[]).includes(value);
const isInstallmentStatus = (value: string): value is InstallmentStatusValue =>
  (INSTALLMENT_STATUSES as readonly string[]).includes(value);

/**
 * Reads the confirm form. `today` is the day in Colombo. For a case in progress:
 * - the Rs. 2,000,000 release as REL-2 has it, but with no earliest day, since the sheet has no
 *   verification date
 * - each installment's status, in order: the paid ones first, then at most one under way (INS-2)
 * - the day each was paid (INS-4) or is expected (INS-3), as the DS office would have entered them
 */
export function parseConfirmForm(
  read: (field: ConfirmField) => string,
  today: string,
): { ok: true; value: ConfirmValues } | { ok: false; errors: ConfirmErrors } {
  const outcome = read("outcome").trim();
  if (!isOutcome(outcome)) return { ok: false, errors: { outcome: "outcomeRequired" } };

  if (outcome === "verified") return { ok: true, value: { outcome } };
  if (outcome === "rejected" || outcome === "stopped") {
    const reason = parseReason(read("reason"));
    return reason.ok
      ? { ok: true, value: { outcome, reason: reason.value } }
      : { ok: false, errors: { reason: reason.error } };
  }

  const errors: ConfirmErrors = {};
  const release = parseReleaseForm(read, { earliest: null, today });
  if (!release.ok) Object.assign(errors, release.errors);
  const releasedOn = release.ok ? release.value.releasedOn : null;

  const installments: ConfirmedInstallment[] = [];
  let unpaidSeen = false;
  let previousPaidOn: string | null = null;
  for (const number of INSTALLMENT_NUMBERS) {
    const raw = read(`status${number}`).trim();
    const status = isInstallmentStatus(raw) ? raw : "NOT_STARTED";
    if (status !== "NOT_STARTED" && unpaidSeen) errors[`status${number}`] = "notInOrder";
    if (status !== "RELEASED") unpaidSeen = true;

    const dayText = read(`day${number}`);
    let problem: DayError | null = null;
    if (status === "RELEASED") {
      // Without a release day, only the day's own checks apply; the release field shows its error.
      problem = dayProblem(dayText, paidLimits(today, releasedOn ?? "", previousPaidOn));
      if (!problem) previousPaidOn = dayText.trim();
    } else if (status === "PROCESSING") {
      problem = dayProblem(dayText, startLimits(releasedOn ?? ""));
    }
    if (problem) errors[`day${number}`] = problem;
    installments.push({
      number,
      status,
      expectedOn: status === "PROCESSING" ? dayText.trim() : null,
      releasedOn: status === "RELEASED" ? dayText.trim() : null,
    });
  }

  if (!release.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { outcome, release: release.value, installments } };
}

/** How many of the four installments the confirmation records as paid. */
export function paidCount(installments: readonly { status: string }[]): number {
  return installments.filter((i) => i.status === "RELEASED").length;
}
