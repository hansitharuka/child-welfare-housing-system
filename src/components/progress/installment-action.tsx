"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { FormError, FormField, FormTextArea } from "@/components/forms/form-field";
import { Modal } from "@/components/modal";
import { formatDate } from "@/lib/dates";
import { formatRupees, INSTALLMENT_AMOUNT } from "@/lib/money";
import {
  type DayLimits,
  PAID_FIELDS,
  parsePaidForm,
  parseStartForm,
  type ProgressErrorKey,
  START_FIELDS,
} from "@/lib/validation/progress";
import type { ProgressAction } from "./types";

type Field = "expectedOn" | "releasedOn" | "purpose" | "note";

/**
 * The DS office's button on the next installment, as in the prototype: "start the payment" with the
 * day it expects to pay (INS-3), then "mark paid" with the day paid (INS-4). Each opens a pop-up whose
 * form the browser checks as the server does; what was typed stays after a refusal (ERR-1).
 */
export function InstallmentAction({
  step,
  caseId,
  version,
  number,
  installmentName,
  limits,
  initial,
  action,
}: {
  step: "start" | "pay";
  caseId: string;
  version: number;
  number: number;
  installmentName: string;
  /** From startLimits() or paidLimits(). */
  limits: DayLimits;
  initial: { day: string; purpose: string; note: string };
  action: ProgressAction;
}) {
  const t = useTranslations("progress");
  const locale = useLocale();
  const [state, dispatch, pending] = useActionState(action, { error: null, errors: {} });
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const dayField = step === "start" ? "expectedOn" : "releasedOn";
  const [values, setValues] = useState<Record<Field, string>>({
    expectedOn: step === "start" ? initial.day : "",
    releasedOn: step === "pay" ? initial.day : "",
    purpose: initial.purpose,
    note: initial.note,
  });
  // The browser's own checks; null once the form has gone to the server, whose answer then shows.
  const [checkErrors, setCheckErrors] = useState<Partial<Record<Field, ProgressErrorKey>> | null>(null);
  const errors: Partial<Record<Field, ProgressErrorKey>> = checkErrors ?? state.errors;
  const id = (field: Field) => `installment-${number}-${field}`;
  // The release day comes first in the limits; the date picker starts at the latest earliest day.
  const releaseDay = limits.earliest[0]?.day ?? null;
  const minDay = limits.earliest
    .flatMap((e) => (e.day ? [e.day] : []))
    .sort()
    .at(-1);

  function submit() {
    const read = (field: Field) => values[field];
    const checked = step === "start" ? parseStartForm(read, limits) : parsePaidForm(read, limits);
    if (!checked.ok) {
      setCheckErrors(checked.errors);
      return;
    }
    setCheckErrors(null);
    const form = new FormData();
    form.set("caseId", caseId);
    form.set("version", String(version));
    form.set("number", String(number));
    for (const field of step === "start" ? START_FIELDS : PAID_FIELDS) form.set(field, values[field]);
    startTransition(() => dispatch(form));
  }

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const errorText = (field: Field) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const title = t(step === "start" ? "installments.startTitle" : "installments.payTitle", {
    installment: installmentName,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-11.5 rounded-lg px-4.5 text-base font-semibold ${
          step === "start" ? "border border-primary bg-card text-primary" : "bg-primary text-primary-foreground"
        }`}
      >
        {t(step === "start" ? "installments.start" : "installments.pay")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`installment-${number}-title`}>
        <h2 id={`installment-${number}-title`} className="text-[22px] font-bold">
          {title}
        </h2>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-4 rounded-lg bg-background px-4.5 py-3">
            <span className="font-semibold">{t("installments.amount")}</span>
            <span className="text-[22px] font-bold">{formatRupees(INSTALLMENT_AMOUNT, locale)}</span>
          </div>
          <FormField
            id={id(dayField)}
            type="date"
            label={t(step === "start" ? "installments.expectedOn" : "installments.paidOn")}
            help={
              step === "start" && releaseDay
                ? t("installments.expectedOnHelp", { date: formatDate(releaseDay) })
                : t("installments.paidOnHelp")
            }
            min={minDay}
            max={limits.latest ?? undefined}
            value={values[dayField]}
            onChange={set(dayField)}
            error={errorText(dayField)}
          />
          {step === "start" && (
            <FormField
              id={id("purpose")}
              label={t("installments.purpose")}
              value={values.purpose}
              onChange={set("purpose")}
              maxLength={200}
              error={errorText("purpose")}
            />
          )}
          <FormTextArea
            id={id("note")}
            label={t("installments.note")}
            value={values.note}
            onChange={set("note")}
            error={errorText("note")}
          />
          {checkErrors === null && state.error && (
            <FormError id={`installment-${number}-error`} message={t(`errors.${state.error}`)} />
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-lg border border-input px-6 text-[17px] font-semibold"
            >
              {t("installments.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-12 rounded-lg bg-primary px-6.5 text-[17px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {pending ? t("installments.working") : t("installments.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
