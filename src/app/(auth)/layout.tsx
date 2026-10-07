import { getTranslations } from "next-intl/server";
import { Lockup } from "@/components/brand/lockup";
import { LanguagePicker } from "@/components/language-picker";

/** Sign-in and password pages: the logo and the programme's name above one card in the middle, with no menu. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-center gap-3 sm:mx-8 sm:justify-end">
        <LanguagePicker tone="page" />
      </div>
      <main className="flex flex-1 flex-col items-center gap-10 px-4 pt-12 pb-12 sm:px-6 sm:pt-16">
        <Lockup name={t("name")} ministry={t("ministry")} />
        <div className="w-full max-w-[460px] rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
