import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireRole } from "@/server/context";

export default async function AdminListsPage() {
  await requireRole("ADMIN");
  return <PlaceholderPage titleKey="adminLists" />;
}
