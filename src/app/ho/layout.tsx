import { AppShell } from "@/components/shell/app-shell";
import { importedCount, waitingNow } from "@/server/cases/queues";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";

/**
 * The menu shows how many cases wait for a check or a release (NTF-1). A layout isn't rendered again
 * on a client-side move: the actions that change a queue refresh it with revalidatePath, and the menu
 * reads the count again from /ho/waiting after every move, so it agrees with the page beside it.
 * While cases from the old sheet wait to be confirmed, the menu leads to them too (IMP-5).
 */
export default async function HoLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole("HO_OFFICER");
  const [waiting, imported] = await Promise.all([waitingNow(db, context), importedCount(db, context)]);
  return (
    <AppShell
      area="ho"
      userName={context.name}
      nav={[
        { href: "/ho", labelKey: "hoDashboard", exact: true },
        { href: "/ho/cases", labelKey: "hoCases" },
        {
          href: "/ho/check",
          labelKey: "hoCheck",
          alsoActive: ["/ho/release"],
          count: { ...waiting, source: "/ho/waiting" },
        },
        ...(imported > 0 ? [{ href: "/ho/imported", labelKey: "hoImported" as const }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
