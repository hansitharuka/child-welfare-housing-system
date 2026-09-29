import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/context";

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
    >
      {children}
    </AppShell>
  );
}
