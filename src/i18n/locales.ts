/** The screen languages (UI-1): Sinhala, Tamil and English. Sinhala is the default. */
export const LOCALES = ["si", "ta", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "si";

/**
 * The cookie that remembers a browser's language (UI-9). Not httpOnly: the root error page
 * (global-error.tsx) reads it in the browser, because by then the server has failed.
 */
export const LOCALE_COOKIE = "lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** A cookie's value as a language: anything else, or nothing, gives Sinhala. */
export function readLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
