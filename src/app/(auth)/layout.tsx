import { getTranslations } from "next-intl/server";

/** Sign-in and password pages: the green header without a menu, and one card in the middle. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  const showTestBanner = process.env.APP_ENV !== "production";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-5 bg-header px-8 text-header-foreground">
        <span className="text-[22px] font-bold">{t("name")}</span>
        {showTestBanner && (
          <span className="ms-auto rounded-full bg-notice px-3 py-1 text-sm font-semibold text-notice-foreground">
            {t("testBanner")}
          </span>
        )}
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-20 pb-10">
        <div className="w-full max-w-[460px] rounded-xl border border-border bg-card p-8 shadow-sm">{children}</div>
      </main>
    </div>
  );
}
