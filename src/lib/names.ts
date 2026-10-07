import type { Locale } from "@/i18n/locales";

/** A province's, district's, DS office's or building stage's name in each screen language (UI-9). */
export type Names = { nameSi: string; nameTa: string; nameEn: string };

/** Prisma `select` for the three names. */
export const NAMES = { nameSi: true, nameTa: true, nameEn: true } as const;

const FIELD: Record<Locale, keyof Names> = { si: "nameSi", ta: "nameTa", en: "nameEn" };

/** The name to show on a screen, or in a file, in this language. */
export function localName(row: Names, locale: Locale): string {
  return row[FIELD[locale]];
}

/** The name column to sort by in this language. */
export function nameField(locale: Locale): keyof Names {
  return FIELD[locale];
}
