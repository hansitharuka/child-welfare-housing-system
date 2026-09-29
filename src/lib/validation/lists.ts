import { z } from "zod";

/** Error messages are keys under "lists.errors" in messages/si.json. */
export type ListErrorKey = "required" | "tooShort" | "tooLong" | "code" | "englishName";

const sinhalaName = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .min(2, { error: "tooShort" })
  .max(60, { error: "tooLong" });

/** LST-2: a DS office's Sinhala and English names, and its three-letter code. */
export const officeSchema = z.object({
  nameSi: sinhalaName,
  nameEn: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .min(2, { error: "tooShort" })
    .max(60, { error: "tooLong" })
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, { error: "englishName" }),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: "code" }),
});

export const officeNamesSchema = officeSchema.pick({ nameSi: true, nameEn: true });

/** LST-4: a building stage's name. */
export const stageSchema = z.object({ nameSi: sinhalaName });

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
