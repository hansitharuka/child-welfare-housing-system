import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireRole } from "@/server/context";

export default async function HoCheckPage() {
  await requireRole("HO_OFFICER");
  return <PlaceholderPage titleKey="hoCheck" />;
}
