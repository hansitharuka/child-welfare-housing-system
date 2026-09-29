import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { NavLinks } from "./nav-links";
import type { Area, NavEntry } from "./types";

/** Header, menu and page area shared by every role's screens, as in the prototype (UI-7). */
export async function AppShell({
  area,
  userName,
  officeName,
  nav,
  children,
}: {
  area: Area;
  userName: string;
  /** The DS office of a DS officer; shown in the header instead of the general area name. */
  officeName?: string | null;
  nav: NavEntry[];
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const showTestBanner = process.env.APP_ENV !== "production";
  const areaLabel = officeName ? t("areas.dsOffice", { office: officeName }) : t(`areas.${area}`);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-5 bg-header px-8 text-header-foreground">
        <span className="text-[22px] font-bold">{t("app.name")}</span>
        <span className="text-base text-header-muted">{areaLabel}</span>
        <div className="ms-auto flex items-center gap-4">
          {showTestBanner && (
            <span className="rounded-full bg-notice px-3 py-1 text-sm font-semibold text-notice-foreground">
              {t("app.testBanner")}
            </span>
          )}
          <span className="text-base" aria-label={`${t("shell.signedInAs")} ${userName}`}>
            {userName}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="h-10 rounded-lg border border-header-muted/60 px-4 text-[15px] font-semibold hover:bg-white/10"
            >
              {t("shell.signOut")}
            </button>
          </form>
        </div>
      </header>
      <NavLinks
        label={t("nav.label")}
        items={nav.map((entry) => ({ href: entry.href, label: t(`nav.${entry.labelKey}`), exact: entry.exact }))}
      />
      <main className="flex-1 px-8 pt-7 pb-10">{children}</main>
    </div>
  );
}
