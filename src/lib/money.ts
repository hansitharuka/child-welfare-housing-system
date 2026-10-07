import type { Locale } from "@/i18n/locales";

/** The rupee's short form in each screen language (UI-3, UI-9). */
const RUPEES: Record<Locale, string> = { si: "රු.", ta: "ரூ.", en: "Rs." };

const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Formats a count, or whole rupees under a "(රු.)" heading, as "2,000,000": Western digits with comma separators (UI-3). */
export function formatNumber(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not a whole number: ${value}`);
  return digits.format(value);
}

/** Formats whole rupees as "රු. 2,000,000", "ரூ. 2,000,000" or "Rs. 2,000,000" (UI-3). */
export function formatRupees(amount: number, locale: Locale): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Amounts are whole rupees: ${amount}`);
  return `${RUPEES[locale]} ${formatNumber(amount)}`;
}

/** Each case gets Rs. 2,000,000 (REL-2), paid to the beneficiary in four installments of Rs. 500,000 (INS-1). */
export const RELEASE_AMOUNT = 2_000_000;
export const INSTALLMENT_AMOUNT = 500_000;
export const INSTALLMENT_COUNT = 4;

type Paid = { amount: number; status: string };

/** What has been paid to the beneficiary: the installments marked paid (INS-4). */
export function paidOut(installments: readonly Paid[]): number {
  return installments.filter((i) => i.status === "RELEASED").reduce((sum, i) => sum + i.amount, 0);
}

/** What the DS office still holds of a case's release (CLS-2): the amount released, less what was paid out. */
export function balance(release: { amount: number } | null, installments: readonly Paid[]): number {
  return release ? release.amount - paidOut(installments) : 0;
}
