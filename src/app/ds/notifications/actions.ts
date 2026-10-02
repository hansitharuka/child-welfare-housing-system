"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { markAllRead, openNotification } from "@/server/notifications/commands";

/** NTF-1: opening a notification marks it read and shows its case. */
export async function openNotificationAction(form: FormData) {
  const viewer = await requireRole("DS_OFFICER");
  const id = form.get("id");
  const opened = typeof id === "string" ? await openNotification(db, viewer, id) : null;
  if (!opened) notFound();
  revalidatePath("/ds", "layout");
  redirect(`/ds/cases/${opened.caseId}`);
}

export async function markAllReadAction() {
  const viewer = await requireRole("DS_OFFICER");
  await markAllRead(db, viewer.userId);
  revalidatePath("/ds", "layout");
}
