/**
 * National Identity Card numbers (CASE-2, CASE-6). Sri Lanka has two formats:
 * - old: 9 digits and a letter V or X, for example 880001234V
 * - new: 12 digits, for example 198800001234
 */
const OLD = /^\d{9}[VX]$/;
const NEW = /^\d{12}$/;

/** How a NIC is stored: capitals, no spaces. */
export function normaliseNic(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/** True for a normalised NIC in either format. */
export function isValidNic(nic: string): boolean {
  return OLD.test(nic) || NEW.test(nic);
}

/**
 * The 12-digit form used to find the same person under either format (CASE-6): an old number
 * becomes "19" + its first 5 digits + "0" + its next 4 digits, so 880001234V becomes 198800001234.
 * Returns null for anything that is not a valid NIC.
 */
export function nicKey(raw: string): string | null {
  const nic = normaliseNic(raw);
  if (NEW.test(nic)) return nic;
  if (OLD.test(nic)) return `19${nic.slice(0, 5)}0${nic.slice(5, 9)}`;
  return null;
}
