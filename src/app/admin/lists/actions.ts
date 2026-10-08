"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import type { Kind } from "@/generated/prisma/enums";
import { isLocale } from "@/i18n/locales";
import { type ListErrorKey, officeCodeSchema, parseForm, readNames } from "@/lib/validation/lists";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import {
  addOffice,
  addStage,
  type ListCommandError,
  moveStage,
  renameOffice,
  renameStage,
  setOfficeActive,
  setStageActive,
} from "@/server/lists/commands";

export type ListFormState = {
  errors: Record<string, ListErrorKey>;
  error: ListCommandError | null;
  /** Goes up by one after each save, so the form can clear itself and say it was saved. */
  saves: number;
  /** The last save had names the system wrote from the typed one (UI-9). */
  written: boolean;
};

const read = (form: FormData) => (field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
};

/** The names from a form, typed in the language the form was shown in (UI-9). */
async function names(form: FormData) {
  const from = form.get("from");
  return readNames(read(form), isLocale(from) ? from : await getLocale());
}

const refused = (previous: ListFormState, errors: Record<string, ListErrorKey>): ListFormState => ({
  errors,
  error: null,
  saves: previous.saves,
  written: false,
});

async function run(
  previous: ListFormState,
  written: boolean,
  command: () => Promise<{ ok: true } | { ok: false; error: ListCommandError }>,
): Promise<ListFormState> {
  const result = await command();
  if (!result.ok) return { errors: {}, error: result.error, saves: previous.saves, written: false };
  revalidatePath("/admin/lists");
  return { errors: {}, error: null, saves: previous.saves + 1, written };
}

export async function addOfficeAction(
  districtId: number,
  previous: ListFormState,
  form: FormData,
): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = await names(form);
  const code = parseForm(officeCodeSchema, read(form));
  if (!parsed.ok || !code.ok) {
    return refused(previous, { ...(parsed.ok ? {} : parsed.errors), ...(code.ok ? {} : code.errors) });
  }
  return run(previous, parsed.written, () =>
    addOffice(db, admin.userId, districtId, { ...parsed.value, ...code.value }),
  );
}

export async function renameOfficeAction(id: number, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = await names(form);
  if (!parsed.ok) return refused(previous, parsed.errors);
  return run(previous, parsed.written, () => renameOffice(db, admin.userId, id, parsed.value));
}

export async function setOfficeActiveAction(id: number, active: boolean): Promise<void> {
  const admin = await requireRole("ADMIN");
  await setOfficeActive(db, admin.userId, id, active);
  revalidatePath("/admin/lists");
}

export async function addStageAction(kind: Kind, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = await names(form);
  if (!parsed.ok) return refused(previous, parsed.errors);
  return run(previous, parsed.written, () => addStage(db, admin.userId, kind, parsed.value));
}

export async function renameStageAction(id: number, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = await names(form);
  if (!parsed.ok) return refused(previous, parsed.errors);
  return run(previous, parsed.written, () => renameStage(db, admin.userId, id, parsed.value));
}

export async function moveStageAction(id: number, direction: "up" | "down"): Promise<void> {
  const admin = await requireRole("ADMIN");
  await moveStage(db, admin.userId, id, direction);
  revalidatePath("/admin/lists");
}

export async function setStageActiveAction(id: number, active: boolean): Promise<void> {
  const admin = await requireRole("ADMIN");
  await setStageActive(db, admin.userId, id, active);
  revalidatePath("/admin/lists");
}
