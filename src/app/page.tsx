import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Temporary start page until sign-in arrives in Phase 2; then this redirects to /login.
export default async function StartPage() {
  const t = await getTranslations("start");
  const areas = [
    { href: "/ds", label: t("ds") },
    { href: "/ho", label: t("ho") },
    { href: "/admin/users", label: t("admin") },
  ];
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-[28px] leading-snug font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ul className="flex flex-col gap-3">
        {areas.map((area) => (
          <li key={area.href}>
            <Link
              href={area.href}
              className="flex h-13 items-center rounded-lg bg-primary px-6 text-[17px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {area.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
