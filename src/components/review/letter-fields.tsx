"use client";

import { useTranslations } from "next-intl";
import { FormField, FormTextArea } from "@/components/forms/form-field";
import type { ReleaseDateLimits, ReleaseErrors, ReleaseField } from "@/lib/validation/release";

export type LetterValues = Record<ReleaseField, string>;

/**
 * The allocation letter's own fields as in the prototype (REL-2): its number, date and last valid day
 * in one row, then `children` (the scan, when recording), then the note. Used to record a letter and
 * to correct one (REL-4).
 */
export function LetterFields({
  idPrefix,
  values,
  onChange,
  errors,
  limits,
  children,
}: {
  idPrefix: string;
  values: LetterValues;
  onChange: (field: ReleaseField, value: string) => void;
  errors: ReleaseErrors;
  limits: ReleaseDateLimits;
  children?: React.ReactNode;
}) {
  const t = useTranslations("review");
  const id = (field: ReleaseField) => `${idPrefix}-${field}`;
  const set = (field: ReleaseField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(field, event.target.value);
  const errorText = (field: ReleaseField) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
        <FormField
          id={id("letterNumber")}
          label={t("letters.number")}
          placeholder={t("letters.numberPlaceholder")}
          value={values.letterNumber}
          onChange={set("letterNumber")}
          autoComplete="off"
          error={errorText("letterNumber")}
        />
        <FormField
          id={id("letterDate")}
          type="date"
          label={t("letters.date")}
          min={limits.earliest ?? undefined}
          max={limits.today}
          value={values.letterDate}
          onChange={set("letterDate")}
          error={errorText("letterDate")}
        />
        <FormField
          id={id("validUntil")}
          type="date"
          label={t("letters.until")}
          help={t("letters.untilHelp")}
          min={values.letterDate || undefined}
          value={values.validUntil}
          onChange={set("validUntil")}
          error={errorText("validUntil")}
        />
      </div>
      {children}
      <FormTextArea
        id={id("note")}
        label={t("letters.note")}
        value={values.note}
        onChange={set("note")}
        error={errorText("note")}
      />
    </>
  );
}
