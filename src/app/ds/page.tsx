import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireRole } from "@/server/context";

export default async function DsHomePage() {
  await requireRole("DS_OFFICER");
  return <PlaceholderPage titleKey="dsHome" />;
}
