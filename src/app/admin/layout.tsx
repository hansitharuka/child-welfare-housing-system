import { AppShell } from "@/components/shell/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      area="admin"
      nav={[
        { href: "/admin/users", labelKey: "adminUsers" },
        { href: "/admin/lists", labelKey: "adminLists" },
      ]}
    >
      {children}
    </AppShell>
  );
}
