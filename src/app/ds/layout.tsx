import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { unreadCount } from "@/server/notifications/queries";

export default async function DsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole("DS_OFFICER");
  return (
    <AppShell
      area="ds"
      userName={context.name}
      officeName={context.dsOfficeName}
      nav={[
        { href: "/ds", labelKey: "dsHome", exact: true },
        { href: "/ds/cases/new", labelKey: "dsNewCase" },
      ]}
      bell={{ href: "/ds/notifications", unread: await unreadCount(db, context) }}
    >
      {children}
    </AppShell>
  );
}
