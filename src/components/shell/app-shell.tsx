import { getTranslations } from "next-intl/server";
import { Bell } from "./bell";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import type { Area, LiveCount, NavEntry } from "./types";

/** Header, menu and page area shared by every role's screens, as in the prototype (UI-7). */
export async function AppShell({
  area,
  userName,
  officeName,
  nav,
  bell,
  children,
}: {
  area: Area;
  userName: string;
  /** The DS office of a DS officer; shown in the header instead of the general area name. */
  officeName?: string | null;
  nav: NavEntry[];
  /** NTF-1: the notifications page and how many are unread. */
  bell?: { href: string; unread: LiveCount };
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
          {bell && <Bell href={bell.href} unread={bell.unread} />}
          <span className="text-base" aria-label={`${t("shell.signedInAs")} ${userName}`}>
            {userName}
          </span>
          <SignOutButton />
        </div>
      </header>
      <NavLinks
        label={t("nav.label")}
        items={nav.map((entry) => ({
          href: entry.href,
          label: t(`nav.${entry.labelKey}`),
          exact: entry.exact,
          alsoActive: entry.alsoActive,
          count: entry.count,
        }))}
      />
      <main className="flex-1 px-8 pt-7 pb-10">{children}</main>
    </div>
  );
}
