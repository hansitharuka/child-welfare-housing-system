import { isValidNic, nicKey, normaliseNic } from "@/lib/nic";
import { isValidPhone } from "@/lib/phone";

/**
 * Tidies the sheet's NICs and phone numbers into the forms the system stores (CASE-2). A missing one
 * is allowed on an imported case (IMP-4). One that can't be read is left out and reported, and the
 * cell as written is kept in the case's sheet notes, so nothing the sheet said is lost.
 */

export type ReadNic = { nic: string | null; nicKey: string | null; problem: "badNic" | null };

/**
 * Capitals and no spaces, so 880001234 v becomes 880001234V. Excel's numbers are already text here.
 * A cell without a digit, such as "-", counts as empty.
 */
export function readNic(text: string | null): ReadNic {
  if (!text || !/\d/.test(text)) return { nic: null, nicKey: null, problem: null };
  const nic = normaliseNic(text);
  if (!isValidNic(nic)) return { nic: null, nicKey: null, problem: "badNic" };
  return { nic, nicKey: nicKey(nic), problem: null };
}

/** The most a case holds (mobile 1 and mobile 2). */
const MAX_PHONES = 2;

export type ReadPhones = { phones: string[]; problem: "badPhone" | "tooManyPhones" | null };

/**
 * Excel drops a phone number's first 0 when it holds it as a number, so nine digits get it back.
 * +94 or 94 in front becomes 0.
 */
function withZero(digits: string): string {
  if (/^[1-9]\d{8}$/.test(digits)) return `0${digits}`;
  if (/^94\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return digits;
}

/**
 * The phone numbers in a cell: 077-1234567, sometimes two or three split by spaces or slashes. When
 * the parts aren't all numbers, the cell may be one number with spaces in it (077 123 4567). The first
 * two good numbers are kept. A cell without a digit, such as "-", counts as empty.
 */
export function readPhones(text: string | null): ReadPhones {
  if (!text || !/\d/.test(text)) return { phones: [], problem: null };
  const parts = text
    .split(/[^\d-]+/)
    .map((part) => withZero(part.replaceAll("-", "")))
    .filter(Boolean);
  const whole = withZero(text.replace(/\D/g, ""));
  const good = parts.every(isValidPhone) ? parts : isValidPhone(whole) ? [whole] : null;
  const phones = [...new Set(good ?? parts.filter(isValidPhone))];
  if (phones.length > MAX_PHONES) return { phones: phones.slice(0, MAX_PHONES), problem: "tooManyPhones" };
  return { phones, problem: good ? null : "badPhone" };
}
