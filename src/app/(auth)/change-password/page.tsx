import { getTranslations } from "next-intl/server";
import { requireSignedIn } from "@/server/context";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const context = await requireSignedIn({ allowTemporaryPassword: true });
  const t = await getTranslations("changePassword");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-snug font-bold">{t("title")}</h1>
        <p className="text-[15px] text-muted-foreground">
          {context.mustChangePassword ? t("intro") : t("introVoluntary")}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
