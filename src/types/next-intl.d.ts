import type messages from "../../messages/si.json";
import type { Locale } from "../i18n/locales";

// Typed message keys: a missing or misspelt key fails the type check instead of showing raw text.
// messages/si.json is the source; ta.json and en.json must have the same keys (src/i18n/messages.test.ts).
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
