"use client";

import messages from "../../messages/si.json";

/**
 * Shown only if the root layout itself fails, so it can't rely on the layout's language setup.
 * It reads the same Sinhala messages file directly.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const t = messages.error;
  return (
    <html lang="si">
      <body style={{ fontFamily: "'Noto Sans Sinhala', 'Nirmala UI', system-ui, sans-serif", padding: "4rem 1.5rem" }}>
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
