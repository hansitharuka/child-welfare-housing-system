const RUPEES = "රු.";

const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Formats whole rupees as "රු. 2,000,000": Western digits with comma separators (UI-3). */
export function formatRupees(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Amounts are whole rupees: ${amount}`);
  return `${RUPEES} ${digits.format(amount)}`;
}
