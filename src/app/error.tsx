"use client";

import { useTranslations } from "next-intl";

/**
 * ERR-6: a general Sinhala message with a reference code. The code is Next.js's error digest,
 * which also appears in the server log, so a report can be matched to the log without personal data.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-[28px] leading-snug font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      {error.digest && (
        <p className="text-[15px]">
          {t("reference")}: <code className="font-mono">{error.digest}</code>
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="h-12 self-start rounded-lg bg-primary px-6 text-[17px] font-semibold text-primary-foreground"
      >
        {t("retry")}
      </button>
    </main>
  );
}
