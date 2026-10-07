import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { accountHistory, getAccount, officeChoices, officeNames } from "@/server/users/queries";
import { AccountForm } from "../../account-form";
import { updateAccountAction } from "../../actions";
import { AccountHistory } from "./account-history";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const locale = await getLocale();
  const { id } = await params;
  const account = await getAccount(db, id);
  if (!account) notFound();

  const [t, districts, history, names] = await Promise.all([
    getTranslations("users.form"),
    officeChoices(db, locale, account.dsOfficeId),
    accountHistory(db, id),
    officeNames(db, locale),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-snug font-bold">{t("editTitle")}</h1>
        <p className="text-muted-foreground">{t("editSubtitle", { username: account.username })}</p>
      </div>
      <AccountForm account={account} districts={districts} action={updateAccountAction.bind(null, id)} />
      <AccountHistory entries={history} officeNames={names} />
    </div>
  );
}
