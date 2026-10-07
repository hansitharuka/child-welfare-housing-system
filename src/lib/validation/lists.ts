import { z } from "zod";

/** Error messages are keys under "lists.errors" in messages/si.json. */
export type ListErrorKey = "required" | "tooShort" | "tooLong" | "code" | "englishName" | "tamilName";

const name = () =>
  z.string().trim().min(1, { error: "required" }).min(2, { error: "tooShort" }).max(60, { error: "tooLong" });

const sinhalaName = name();

/** Tamil letters (UI-9), with the same spaces and marks as English names. */
const tamilName = name().regex(/^\p{Script=Tamil}[\p{Script=Tamil} .'/&-]*$/u, { error: "tamilName" });

// "/" and "&" for offices with two names, such as "Valikamam East / Kopay" and "Manmunai South & Eruvil Pattu".
const englishName = name().regex(/^[A-Za-z][A-Za-z .'/&-]*$/, { error: "englishName" });

/** LST-2: a DS office's names in Sinhala, Tamil and English (UI-9), and its three-letter code. */
export const officeSchema = z.object({
  nameSi: sinhalaName,
  nameTa: tamilName,
  nameEn: englishName,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: "code" }),
});

export const officeNamesSchema = officeSchema.pick({ nameSi: true, nameTa: true, nameEn: true });

/** LST-4: a building stage's name in Sinhala, Tamil and English (UI-9). */
export const stageSchema = officeNamesSchema;

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
