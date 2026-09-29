import type messages from "../../messages/si.json";

// Typed message keys: a missing or misspelt key fails the type check instead of showing raw text.
declare module "next-intl" {
  interface AppConfig {
    Locale: "si";
    Messages: typeof messages;
  }
}
