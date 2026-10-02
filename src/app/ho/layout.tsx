import { AppShell } from "@/components/shell/app-shell";
import { queueCounts } from "@/server/cases/queues";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";

/**
 * The menu shows how many cases wait for a check or a release (NTF-1). A layout isn't rendered again
 * on every client-side move, so the actions that change a queue refresh it with revalidatePath.
 */
export default async function HoLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole("HO_OFFICER");
  const waiting = await queueCounts(db, context);
  return (
    <AppShell
      area="ho"
      userName={context.name}
      nav={[
        { href: "/ho", labelKey: "hoDashboard", exact: true },
        { href: "/ho/cases", labelKey: "hoCases" },
        { href: "/ho/check", labelKey: "hoCheck", alsoActive: ["/ho/release"], count: waiting.check + waiting.release },
      ]}
    >
      {children}
    </AppShell>
  );
}
