"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, readLocale } from "@/i18n/locales";
import messages from "../../messages/si.json";

type ErrorText = typeof messages.error;

/** The language chosen in this browser (UI-9), read from its cookie. */
function chosenLocale() {
  const prefix = `${LOCALE_COOKIE}=`;
  const cookie = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return readLocale(cookie?.slice(prefix.length));
}

/**
 * Shown only if the root layout itself fails, so it can't rely on the layout's language setup.
 * It shows the Sinhala messages at once, and loads the Tamil or English ones if the browser chose them.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [shown, setShown] = useState<{ lang: string; t: ErrorText }>({ lang: "si", t: messages.error });

  useEffect(() => {
    const locale = chosenLocale();
    if (locale === "si") return;
    import(`../../messages/${locale}.json`)
      .then((loaded: { default: typeof messages }) => setShown({ lang: locale, t: loaded.default.error }))
      .catch(() => {});
  }, []);

  const { lang, t } = shown;
  return (
    <html lang={lang}>
      <body
        style={{
          fontFamily: "'Noto Sans Sinhala', 'Noto Sans Tamil', 'Nirmala UI', system-ui, sans-serif",
          padding: "4rem 1.5rem",
        }}
      >
        <h1>{t.title}</h1>
        <p>{t.body}</p>
        {error.digest && (
          <p>
            {t.reference}: <code>{error.digest}</code>
          </p>
        )}
      </body>
    </html>
  );
}
