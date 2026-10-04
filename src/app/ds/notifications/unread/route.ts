import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { unreadNow } from "@/server/notifications/queries";

/** NTF-1: the bell's unread count, read again after each client-side move (src/components/shell/live-count.ts). */
export async function GET() {
  return Response.json(await unreadNow(db, await requireRole("DS_OFFICER")));
}
