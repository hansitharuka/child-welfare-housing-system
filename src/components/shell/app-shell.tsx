import { getTranslations } from "next-intl/server";
import { NavLinks } from "./nav-links";
import type { Area, NavEntry } from "./types";

/** Header, menu and page area shared by every role's screens, as in the prototype (UI-7). */
export async function AppShell({ area, nav, children }: { area: Area; nav: NavEntry[]; children: React.ReactNode }) {
  const t = await getTranslations();
  const showTestBanner = process.env.APP_ENV !== "production";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-5 bg-header px-8 text-header-foreground">
        <span className="text-[22px] font-bold">{t("app.name")}</span>
        <span className="text-base text-header-muted">{t(`areas.${area}`)}</span>
        {showTestBanner && (
          <span className="ms-auto rounded-full bg-notice px-3 py-1 text-sm font-semibold text-notice-foreground">
            {t("app.testBanner")}
          </span>
        )}
      </header>
      <NavLinks
        label={t("nav.label")}
        items={nav.map((entry) => ({ href: entry.href, label: t(`nav.${entry.labelKey}`), exact: entry.exact }))}
      />
      <main className="flex-1 px-8 pt-7 pb-10">{children}</main>
    </div>
  );
}
