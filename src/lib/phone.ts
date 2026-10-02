/** Phone numbers are 10 digits starting with 0, once spaces are removed (CASE-2, ADM-2). */
const PHONE = /^0\d{9}$/;

/** How a phone number is stored: without spaces. */
export function normalisePhone(raw: string): string {
  return raw.replace(/\s/g, "");
}

/** True for a normalised phone number. */
export function isValidPhone(phone: string): boolean {
  return PHONE.test(phone);
}
