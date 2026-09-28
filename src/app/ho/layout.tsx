import { AppShell } from "@/components/shell/app-shell";

export default function HoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      area="ho"
      nav={[
        { href: "/ho", labelKey: "hoDashboard", exact: true },
        { href: "/ho/check", labelKey: "hoCheck" },
      ]}
    >
      {children}
    </AppShell>
  );
}
