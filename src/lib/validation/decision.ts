import { z } from "zod";

/** Error messages are keys under "review.errors" in messages/si.json. */
export type ReasonErrorKey = "reasonRequired" | "reasonTooShort" | "reasonTooLong";

/** CHK-3, CLS-2, CLS-3: the reason Head Office gives for sending back, rejecting, stopping or reopening. */
const reasonSchema = z
  .string()
  .trim()
  .min(1, { error: "reasonRequired" })
  .min(5, { error: "reasonTooShort" })
  .max(1000, { error: "reasonTooLong" });

export function parseReason(raw: string): { ok: true; value: string } | { ok: false; error: ReasonErrorKey } {
  const result = reasonSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message as ReasonErrorKey };
}
