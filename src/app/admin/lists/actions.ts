"use server";

import { revalidatePath } from "next/cache";
import type { Kind } from "@/generated/prisma/enums";
import { type ListErrorKey, officeNamesSchema, officeSchema, parseForm, stageSchema } from "@/lib/validation/lists";
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
};

const read = (form: FormData) => (field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
};

async function run(
  previous: ListFormState,
  command: () => Promise<{ ok: true } | { ok: false; error: ListCommandError }>,
): Promise<ListFormState> {
  const result = await command();
  if (!result.ok) return { errors: {}, error: result.error, saves: previous.saves };
  revalidatePath("/admin/lists");
  return { errors: {}, error: null, saves: previous.saves + 1 };
}

export async function addOfficeAction(
  districtId: number,
  previous: ListFormState,
  form: FormData,
): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = parseForm(officeSchema, read(form));
  if (!parsed.ok) return { errors: parsed.errors, error: null, saves: previous.saves };
  return run(previous, () => addOffice(db, admin.userId, districtId, parsed.value));
}

export async function renameOfficeAction(id: number, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = parseForm(officeNamesSchema, read(form));
  if (!parsed.ok) return { errors: parsed.errors, error: null, saves: previous.saves };
  return run(previous, () => renameOffice(db, admin.userId, id, parsed.value));
}

export async function setOfficeActiveAction(id: number, active: boolean): Promise<void> {
  const admin = await requireRole("ADMIN");
  await setOfficeActive(db, admin.userId, id, active);
  revalidatePath("/admin/lists");
}

export async function addStageAction(kind: Kind, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = parseForm(stageSchema, read(form));
  if (!parsed.ok) return { errors: parsed.errors, error: null, saves: previous.saves };
  return run(previous, () => addStage(db, admin.userId, kind, parsed.value.nameSi));
}

export async function renameStageAction(id: number, previous: ListFormState, form: FormData): Promise<ListFormState> {
  const admin = await requireRole("ADMIN");
  const parsed = parseForm(stageSchema, read(form));
  if (!parsed.ok) return { errors: parsed.errors, error: null, saves: previous.saves };
  return run(previous, () => renameStage(db, admin.userId, id, parsed.value.nameSi));
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
