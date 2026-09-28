import { getTranslations } from "next-intl/server";
import type { NavKey } from "./types";

/** Stands in for a screen that a later phase builds. */
export async function PlaceholderPage({ titleKey }: { titleKey: NavKey }) {
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[28px] leading-snug font-bold text-balance">{t(`nav.${titleKey}`)}</h1>
      <p className="text-muted-foreground">{t("placeholder.comingSoon")}</p>
    </div>
  );
}
