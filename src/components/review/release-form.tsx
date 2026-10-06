"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import type { ReleaseState } from "@/app/ho/check/actions";
import { FormError, FormField, FormTextArea } from "@/components/forms/form-field";
import { formatRupees, RELEASE_AMOUNT } from "@/lib/money";
import {
  parseReleaseForm,
  RELEASE_FIELDS,
  type ReleaseDateLimits,
  type ReleaseErrors,
  type ReleaseField,
} from "@/lib/validation/release";
import type { QueuePlace } from "@/server/cases/queues";

export type ReleaseFormValues = Record<ReleaseField, string>;

/**
 * REL-2: the date, reference number and note of the Rs. 2,000,000 release. The amount is shown, never
 * typed. The same form corrects a recorded release (REL-4). The browser runs the server's checks
 * first, and what was typed stays after a refusal (ERR-1).
 */
export function ReleaseForm({
  caseId,
  version,
  from,
  place,
  limits,
  initial,
  mode,
  action,
  onCancel,
}: {
  caseId: string;
  version: number;
  from: "queue" | "case";
  /** The queue's district or DS office, which the next page keeps (CHK-4). */
  place?: QueuePlace;
  limits: ReleaseDateLimits;
  initial: ReleaseFormValues;
  mode: "record" | "correct";
  action: (state: ReleaseState, form: FormData) => Promise<ReleaseState>;
  onCancel?: () => void;
}) {
  const t = useTranslations("review");
  const [state, dispatch, pending] = useActionState(action, { error: null, errors: {} });
  const [, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  // The browser's own checks; null once the form has gone to the server, whose answer then shows.
  const [checkErrors, setCheckErrors] = useState<ReleaseErrors | null>(null);
  const errors = checkErrors ?? state.errors;
  const id = (field: ReleaseField) => `${mode}-${field}`;

  function submit() {
    const checked = parseReleaseForm((field) => values[field], limits);
    if (!checked.ok) {
      setCheckErrors(checked.errors);
      return;
    }
    setCheckErrors(null);
    const form = new FormData();
    form.set("caseId", caseId);
    form.set("version", String(version));
    form.set("from", from);
    if (place?.districtId) form.set("districtId", String(place.districtId));
    if (place?.dsOfficeId) form.set("dsOfficeId", String(place.dsOfficeId));
    for (const field of RELEASE_FIELDS) form.set(field, values[field]);
    startTransition(() => dispatch(form));
  }

  const set = (field: ReleaseField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const errorText = (field: ReleaseField) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="flex items-center justify-between gap-4 rounded-lg bg-background px-4.5 py-3.5">
        <span className="text-[17px] font-semibold">{t("release.amount")}</span>
        <span className="text-[26px] font-bold">{formatRupees(RELEASE_AMOUNT)}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          id={id("releasedOn")}
          type="date"
          label={t("release.releasedOn")}
          help={t("release.releasedOnHelp")}
          min={limits.earliest ?? undefined}
          max={limits.today}
          value={values.releasedOn}
          onChange={set("releasedOn")}
          error={errorText("releasedOn")}
        />
        <FormField
          id={id("referenceNumber")}
          label={t("release.reference")}
          value={values.referenceNumber}
          onChange={set("referenceNumber")}
          autoComplete="off"
          error={errorText("referenceNumber")}
        />
      </div>
      <FormTextArea
        id={id("note")}
        label={t("release.note")}
        value={values.note}
        onChange={set("note")}
        error={errorText("note")}
      />
      <p className="text-[15px] text-[#3F4843]">{mode === "record" ? t("release.after") : t("correct.text")}</p>
      {checkErrors === null && state.error && (
        <FormError id={`${mode}-release-error`} message={t(`errors.${state.error}`)} />
      )}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-lg border border-input bg-card px-6 text-[17px] font-semibold"
          >
            {t("correct.cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-13 rounded-lg bg-primary px-6.5 text-[17px] font-bold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t("release.working") : mode === "record" ? t("release.save") : t("correct.save")}
        </button>
      </div>
    </form>
  );
}
