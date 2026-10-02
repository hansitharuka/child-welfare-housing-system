import { Bell } from "lucide-react";
import Link from "next/link";
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
  bell,
  children,
}: {
  area: Area;
  userName: string;
  /** The DS office of a DS officer; shown in the header instead of the general area name. */
  officeName?: string | null;
  nav: NavEntry[];
  /** NTF-1: the notifications page and how many are unread. */
  bell?: { href: string; unread: number };
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
          {bell && (
            <Link
              href={bell.href}
              aria-label={
                bell.unread > 0 ? t("notifications.bellUnread", { count: bell.unread }) : t("notifications.bell")
              }
              className="relative flex size-10 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <Bell aria-hidden="true" className="size-6" />
              {bell.unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-notice px-1.5 text-[13px] font-bold text-notice-foreground"
                >
                  {bell.unread}
                </span>
              )}
            </Link>
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
        items={nav.map((entry) => ({
          href: entry.href,
          label: t(`nav.${entry.labelKey}`),
          exact: entry.exact,
          alsoActive: entry.alsoActive,
          badge:
            entry.count === undefined
              ? undefined
              : { count: entry.count, label: t("nav.waiting", { count: entry.count }) },
        }))}
      />
      <main className="flex-1 px-8 pt-7 pb-10">{children}</main>
    </div>
  );
}
