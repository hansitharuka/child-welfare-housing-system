import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireRole } from "@/server/context";

export default async function AdminUsersPage() {
  await requireRole("ADMIN");
  return <PlaceholderPage titleKey="adminUsers" />;
}
