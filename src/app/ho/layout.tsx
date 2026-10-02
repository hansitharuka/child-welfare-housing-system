import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/context";

export default async function HoLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole("HO_OFFICER");
  return (
    <AppShell
      area="ho"
      userName={context.name}
      nav={[
        { href: "/ho", labelKey: "hoDashboard", exact: true },
        { href: "/ho/cases", labelKey: "hoCases" },
        { href: "/ho/check", labelKey: "hoCheck" },
      ]}
    >
      {children}
    </AppShell>
  );
}
