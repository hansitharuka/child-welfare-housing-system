import { z } from "zod";
import { LOCALES, type Locale } from "@/i18n/locales";
import { type Names, nameField } from "@/lib/names";
import { transliterate } from "@/lib/transliterate";

/** Error messages are keys under "lists.errors" in messages/si.json. */
export type ListErrorKey = "required" | "tooShort" | "tooLong" | "code" | "englishName" | "tamilName" | "writeName";

const name = () =>
  z.string().trim().min(1, { error: "required" }).min(2, { error: "tooShort" }).max(60, { error: "tooLong" });

const sinhalaName = name();

/** Tamil letters (UI-9), with the same spaces and marks as English names. */
const tamilName = name().regex(/^\p{Script=Tamil}[\p{Script=Tamil} .'/&-]*$/u, { error: "tamilName" });

// "/" and "&" for offices with two names, such as "Valikamam East / Kopay" and "Manmunai South & Eruvil Pattu".
const englishName = name().regex(/^[A-Za-z][A-Za-z .'/&-]*$/, { error: "englishName" });

const NAME_SCHEMAS = { nameSi: sinhalaName, nameTa: tamilName, nameEn: englishName };

/** LST-2: a DS office's names in Sinhala, Tamil and English (UI-9), and its three-letter code. */
export const officeSchema = z.object({
  ...NAME_SCHEMAS,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: "code" }),
});

export const officeCodeSchema = officeSchema.pick({ code: true });

/**
 * LST-2, LST-4, UI-9: an office's or stage's names from a form. The admin types the name once, in the
 * language they work in (`from`); the other two are optional. A name left blank is written from the typed
 * one in its own letters (`transliterate`), and `written` says so.
 */
export function readNames(
  read: (field: string) => string,
  from: Locale,
): { ok: true; value: Names; written: boolean } | { ok: false; errors: Record<string, ListErrorKey> } {
  const main = nameField(from);
  const names: Partial<Names> = {};
  const errors: Record<string, ListErrorKey> = {};
  for (const locale of LOCALES) {
    const field = nameField(locale);
    const typed = read(field);
    if (field !== main && typed.trim() === "") continue;
    const result = NAME_SCHEMAS[field].safeParse(typed);
    if (result.success) names[field] = result.data;
    else errors[field] = result.error.issues[0].message as ListErrorKey;
  }
  const typedName = names[main];
  if (typedName === undefined || Object.keys(errors).length > 0) return { ok: false, errors };

  let written = false;
  for (const locale of LOCALES) {
    const field = nameField(locale);
    if (names[field] !== undefined) continue;
    // A written name keeps the rules a typed one has; one that breaks them (too long, say) is left to the admin.
    const result = NAME_SCHEMAS[field].safeParse(transliterate(typedName, locale));
    if (result.success) names[field] = result.data;
    else errors[field] = "writeName";
    written = true;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: names as Names, written };
}

/** Reads a form against a schema and turns Zod's issues into one error key per field. */
export function parseForm<S extends z.ZodObject>(
  schema: S,
  read: (field: string) => string,
): { ok: true; value: z.output<S> } | { ok: false; errors: Record<string, ListErrorKey> } {
  const raw = Object.fromEntries(Object.keys(schema.shape).map((field) => [field, read(field)]));
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  const errors: Record<string, ListErrorKey> = {};
  for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.message as ListErrorKey;
  return { ok: false, errors };
}
