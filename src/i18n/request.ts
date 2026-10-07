import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, readLocale } from "./locales";

export const TIME_ZONE = "Asia/Colombo";

/**
 * Each request's language comes from the browser's cookie (UI-9): Sinhala, Tamil or English, with
 * Sinhala when none is chosen. Addresses carry no language, so every link and bookmark works in all three.
 */
export default getRequestConfig(async () => {
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    timeZone: TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
