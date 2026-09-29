import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireRole } from "@/server/context";

export default async function NewCasePage() {
  await requireRole("DS_OFFICER");
  return <PlaceholderPage titleKey="dsNewCase" />;
}
