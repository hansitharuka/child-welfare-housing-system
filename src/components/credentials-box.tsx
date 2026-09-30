import { useTranslations } from "next-intl";

/** Shows a username and a temporary password, once (ADM-2, ADM-5, AUTH-6). */
export function CredentialsBox({ username, temporaryPassword }: { username: string; temporaryPassword: string }) {
  const t = useTranslations("users.credentials");
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("username")}</dt>
          <dd className="font-mono text-xl font-medium select-all" data-testid="new-username">
            {username}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("temporaryPassword")}</dt>
          <dd className="font-mono text-xl font-medium select-all" data-testid="new-password">
            {temporaryPassword}
          </dd>
        </div>
      </dl>
      <p className="text-sm font-semibold text-notice-foreground">{t("onceOnly")}</p>
    </div>
  );
}
