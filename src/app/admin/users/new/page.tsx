import { getTranslations } from "next-intl/server";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { officeChoices } from "@/server/users/queries";
import { AccountForm } from "../account-form";
import { createAccountAction } from "../actions";

export default async function NewAccountPage() {
  await requireRole("ADMIN");
  const [t, districts] = await Promise.all([getTranslations("users.form"), officeChoices(db)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-snug font-bold">{t("newTitle")}</h1>
      <AccountForm account={null} districts={districts} action={createAccountAction} />
    </div>
  );
}
