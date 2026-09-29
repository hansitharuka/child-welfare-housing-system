import { getRequestConfig } from "next-intl/server";

// Version 1 has one language, Sinhala (UI-1). Tamil is added later as messages/ta.json.
export const LOCALE = "si";
export const TIME_ZONE = "Asia/Colombo";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  timeZone: TIME_ZONE,
  messages: (await import(`../../messages/${LOCALE}.json`)).default,
}));
