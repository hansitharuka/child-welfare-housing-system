import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** ERR-2: the same page whether the record does not exist or the user may not see it. */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-[28px] leading-snug font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Link href="/" className="self-start text-[17px] font-semibold text-primary underline underline-offset-4">
        {t("home")}
      </Link>
    </main>
  );
}
