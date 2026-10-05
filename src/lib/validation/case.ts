import { z } from "zod";
import { isValidNic, normaliseNic } from "@/lib/nic";
import { isValidPhone, normalisePhone } from "@/lib/phone";

/**
 * The case form (CASE-1, CASE-2), checked the same way in the browser and in the Server Action.
 * Error messages are keys under "cases.form.errors" in messages/si.json.
 */
export const CATEGORIES = ["CARE_LEAVER", "CHILD_AT_RISK"] as const;
export type CategoryValue = (typeof CATEGORIES)[number];

export const KINDS = ["NEW_HOUSE", "RENOVATION"] as const;
export type KindValue = (typeof KINDS)[number];

/** The form's fields, in the order the form and its list of errors show them. */
export const CASE_FIELDS = [
  "category",
  "kind",
  "childName",
  "name",
  "nic",
  "address",
  "mobile1",
  "mobile2",
  "remark",
] as const;
export type CaseField = (typeof CASE_FIELDS)[number];

export type CaseErrorKey =
  | "categoryRequired"
  | "kindRequired"
  | "childNameRequired"
  | "nameRequired"
  | "guardianNameRequired"
  | "nicRequired"
  | "nicInvalid"
  | "addressRequired"
  | "mobileRequired"
  | "mobileInvalid"
  | "tooShort"
  | "tooLong";

export type CaseValues = {
  category: CategoryValue | null;
  kind: KindValue | null;
  childName: string | null;
  name: string | null;
  nic: string | null;
  address: string | null;
  mobile1: string | null;
  mobile2: string | null;
  remark: string | null;
};
export type CaseErrors = Partial<Record<CaseField, CaseErrorKey>>;

/**
 * "draft" checks only the fields that are filled in (CASE-4).
 * "submit" also needs every required field (CASE-5).
 */
export type CaseCheck = "draft" | "submit";

/** Free text: empty becomes null; when filled in, `min` to `max` characters. */
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .refine((value) => value === "" || value.length >= min, { error: "tooShort" })
    .transform((value) => value || null);

/** One of a fixed list; anything else counts as not chosen. */
const choice = <T extends string>(values: readonly T[]) =>
  z.string().transform((value) => (values.includes(value as T) ? (value as T) : null));

const FIELD_SCHEMAS: Record<CaseField, z.ZodType<string | null, string>> = {
  category: choice(CATEGORIES),
  kind: choice(KINDS),
  childName: text(2, 100),
  name: text(2, 100),
  nic: z
    .string()
    .transform(normaliseNic)
    .refine((value) => value === "" || isValidNic(value), { error: "nicInvalid" })
    .transform((value) => value || null),
  address: text(1, 300),
  mobile1: z
    .string()
    .transform(normalisePhone)
    .refine((value) => value === "" || isValidPhone(value), { error: "mobileInvalid" })
    .transform((value) => value || null),
  mobile2: z
    .string()
    .transform(normalisePhone)
    .refine((value) => value === "" || isValidPhone(value), { error: "mobileInvalid" })
    .transform((value) => value || null),
  remark: text(1, 1000),
};

/** The required fields that are still empty (CASE-2). Submitting needs none (CASE-5). */
export function missingRequired(values: CaseValues): CaseErrors {
  const atRisk = values.category === "CHILD_AT_RISK";
  const errors: CaseErrors = {};
  if (!values.category) errors.category = "categoryRequired";
  if (!values.kind) errors.kind = "kindRequired";
  if (atRisk && !values.childName) errors.childName = "childNameRequired";
  if (!values.name) errors.name = atRisk ? "guardianNameRequired" : "nameRequired";
  if (!values.nic) errors.nic = "nicRequired";
  if (!values.address) errors.address = "addressRequired";
  if (!values.mobile1) errors.mobile1 = "mobileRequired";
  return errors;
}

/**
 * Reads the case form. Missing fields count as empty. `mayStayEmpty` names required fields a "submit"
 * check lets stay empty: on a case from the old sheet, those the sheet left empty (CASE-9, IMP-4).
 */
export function parseCaseForm(
  read: (field: CaseField) => string,
  check: CaseCheck,
  mayStayEmpty: readonly CaseField[] = [],
): { ok: true; value: CaseValues } | { ok: false; errors: CaseErrors } {
  const values = {} as Record<CaseField, string | null>;
  const errors: CaseErrors = {};
  for (const field of CASE_FIELDS) {
    const result = FIELD_SCHEMAS[field].safeParse(read(field));
    values[field] = result.success ? result.data : null;
    if (!result.success) errors[field] = result.error.issues[0]?.message as CaseErrorKey;
  }
  const value = values as CaseValues;

  // A care leaver has no child's name on the case, even if one was typed before the category changed.
  if (value.category === "CARE_LEAVER") {
    value.childName = null;
    delete errors.childName;
  }
  if (check === "submit") {
    for (const [field, key] of Object.entries(missingRequired(value))) {
      if (!mayStayEmpty.includes(field as CaseField)) errors[field as CaseField] ??= key;
    }
  }
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}

/**
 * IMP-5: what the office may fill in on a case brought in from the old sheet, until Head Office
 * confirms it. The sheet has no kind of help, and many rows have no NIC or phone number.
 */
export const IMPORTED_FIELDS = ["kind", "nic", "mobile1", "mobile2"] as const;
export type ImportedField = (typeof IMPORTED_FIELDS)[number];
export type ImportedValues = Pick<CaseValues, ImportedField>;

/** IMP-4: an imported case is missing details while any of these is empty. */
export const IMPORTED_NEEDS = ["kind", "nic", "mobile1"] as const satisfies readonly ImportedField[];

/** IMP-4: once Head Office has confirmed it, the kind is set, and only these can still be missing. */
export const CONFIRMED_NEEDS = ["nic", "mobile1"] as const satisfies readonly (typeof IMPORTED_NEEDS)[number][];

/**
 * Reads the imported case's form (IMP-5). Like a draft (CASE-4), an empty field is allowed and a filled
 * one must be valid. A lone phone number goes first, as the import stores it.
 */
export function parseImportedForm(
  read: (field: ImportedField) => string,
): { ok: true; value: ImportedValues } | { ok: false; errors: CaseErrors } {
  const values = {} as Record<ImportedField, string | null>;
  const errors: CaseErrors = {};
  for (const field of IMPORTED_FIELDS) {
    const result = FIELD_SCHEMAS[field].safeParse(read(field));
    values[field] = result.success ? result.data : null;
    if (!result.success) errors[field] = result.error.issues[0]?.message as CaseErrorKey;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!values.mobile1 && values.mobile2) [values.mobile1, values.mobile2] = [values.mobile2, null];
  return { ok: true, value: values as ImportedValues };
}

/** A DS office chosen on the form (CASE-3), or null when none is. */
export function parseOfficeId(raw: string): number | null {
  const id = Number(raw);
  return raw !== "" && Number.isInteger(id) && id > 0 ? id : null;
}
