import { z } from "zod";
import { parseDay } from "@/lib/dates";

/** Error messages are keys under "review.errors" in messages/si.json. */
export type ReleaseErrorKey =
  | "dateRequired"
  | "dateInvalid"
  | "dateInFuture"
  | "dateBeforeVerified"
  | "dateAfterInstallment"
  | "referenceRequired"
  | "referenceTooLong"
  | "noteTooLong";

export const RELEASE_FIELDS = ["releasedOn", "referenceNumber", "note"] as const;
export type ReleaseField = (typeof RELEASE_FIELDS)[number];
export type ReleaseErrors = Partial<Record<ReleaseField, ReleaseErrorKey>>;

export type ReleaseValues = {
  /** A calendar day, "YYYY-MM-DD". */
  releasedOn: string;
  referenceNumber: string;
  note: string | null;
};

/**
 * The days a release date must fall between (REL-2): from the verification to today, in Colombo.
 * A case with no verification date has no earliest day.
 */
export type ReleaseDateLimits = { earliest: string | null; today: string };

const schema = ({ earliest, today }: ReleaseDateLimits) =>
  z.object({
    releasedOn: z
      .string()
      .trim()
      .min(1, { error: "dateRequired" })
      .refine((value) => parseDay(value) !== null, { error: "dateInvalid", abort: true })
      .refine((value) => value <= today, { error: "dateInFuture" })
      .refine((value) => earliest === null || value >= earliest, { error: "dateBeforeVerified" }),
    referenceNumber: z.string().trim().min(1, { error: "referenceRequired" }).max(50, { error: "referenceTooLong" }),
    note: z
      .string()
      .trim()
      .max(500, { error: "noteTooLong" })
      .transform((value) => value || null),
  });

/**
 * REL-2: the release form, checked the same way in the browser and on the server. The amount is not
 * on the form; it is always Rs. 2,000,000.
 */
export function parseReleaseForm(
  read: (field: ReleaseField) => string,
  limits: ReleaseDateLimits,
): { ok: true; value: ReleaseValues } | { ok: false; errors: ReleaseErrors } {
  const raw = Object.fromEntries(RELEASE_FIELDS.map((field) => [field, read(field)]));
  const result = schema(limits).safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  const errors: ReleaseErrors = {};
  for (const issue of result.error.issues) errors[issue.path[0] as ReleaseField] ??= issue.message as ReleaseErrorKey;
  return { ok: false, errors };
}
