import { AppShell } from "@/components/shell/app-shell";

export default function DsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      area="ds"
      nav={[
        { href: "/ds", labelKey: "dsHome", exact: true },
        { href: "/ds/cases/new", labelKey: "dsNewCase" },
      ]}
    >
      {children}
    </AppShell>
  );
}
