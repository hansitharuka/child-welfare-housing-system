const RUPEES = "රු.";

const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Formats whole rupees as "රු. 2,000,000": Western digits with comma separators (UI-3). */
export function formatRupees(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Amounts are whole rupees: ${amount}`);
  return `${RUPEES} ${digits.format(amount)}`;
}

/** Each case gets Rs. 2,000,000 (REL-2), paid to the beneficiary in four installments of Rs. 500,000 (INS-1). */
export const RELEASE_AMOUNT = 2_000_000;
export const INSTALLMENT_AMOUNT = 500_000;
export const INSTALLMENT_COUNT = 4;
