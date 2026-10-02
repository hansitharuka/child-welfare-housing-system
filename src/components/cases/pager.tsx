import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** "Previous" and "next" links under a long list, keeping the list's other filters. */
export async function Pager({
  page,
  pageSize,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** The list's address for a given page. */
  href: (page: number) => string;
}) {
  if (total <= pageSize) return null;
  const t = await getTranslations("cases.pages");
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const link = "flex h-11 items-center rounded-lg border border-input bg-card px-4 text-[15px] font-semibold";

  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-[15px] text-muted-foreground tabular-nums">{t("showing", { from, to, total })}</span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className={link}>
            {t("previous")}
          </Link>
        )}
        {to < total && (
          <Link href={href(page + 1)} className={link}>
            {t("next")}
          </Link>
        )}
      </span>
    </nav>
  );
}
