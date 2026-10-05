"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import type { ConfirmState } from "@/app/ho/imported/actions";
import { ChoiceCards } from "@/components/forms/case-form";
import { FormError, FormField, FormTextArea } from "@/components/forms/form-field";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/modal";
import { formatRupees, RELEASE_AMOUNT } from "@/lib/money";
import {
  CONFIRM_FIELDS,
  type ConfirmErrors,
  type ConfirmField,
  INSTALLMENT_NUMBERS,
  INSTALLMENT_STATUSES,
  NEEDS_KIND,
  NEEDS_REASON,
  OUTCOMES,
  parseConfirmForm,
} from "@/lib/validation/confirm";

type Values = Record<ConfirmField, string>;

const EMPTY: Values = Object.fromEntries(
  CONFIRM_FIELDS.map((field) => [field, field.startsWith("status") ? "NOT_STARTED" : ""]),
) as Values;

/**
 * IMP-5: Head Office confirms a case brought in from the old sheet as approved, in progress, rejected
 * or stopped. In progress takes the Rs. 2,000,000 release and the status of each installment, with the
 * sheet's note beside it; rejected and stopped take a reason. While the DS office hasn't filled in the
 * kind of help, only rejecting and stopping are offered. The browser runs the server's checks first,
 * the choice is confirmed once because it can't be undone, and what was typed stays after a refusal.
 */
export function ConfirmImport({
  caseId,
  version,
  from,
  districtId,
  caseName,
  kindMissing,
  today,
  sheetInstallments,
  action,
}: {
  caseId: string;
  version: number;
  /** Where the officer is confirming, so the next page is the right one. */
  from: "queue" | "case";
  /** The list's district filter, kept for the next page. */
  districtId?: number;
  caseName: string;
  kindMissing: boolean;
  /** Today in Colombo, "YYYY-MM-DD". */
  today: string;
  /** What the sheet's four installment columns said. */
  sheetInstallments: (string | null)[];
  action: (state: ConfirmState, form: FormData) => Promise<ConfirmState>;
}) {
  const t = useTranslations("imported");
  const tc = useTranslations("cases");
  const [state, dispatch, pending] = useActionState(action, { error: null, errors: {} });
  const [, startTransition] = useTransition();
  const [values, setValues] = useState(EMPTY);
  // The browser's own checks; null once the form has gone to the server, whose answer then shows.
  const [checkErrors, setCheckErrors] = useState<ConfirmErrors | null>(null);
  const [confirming, setConfirming] = useState(false);
  const errors = checkErrors ?? state.errors;
  const outcome = OUTCOMES.find((o) => o === values.outcome);
  const offered = OUTCOMES.filter((o) => !kindMissing || !NEEDS_KIND.includes(o));

  const set = (field: ConfirmField, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const change =
    (field: ConfirmField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(field, event.target.value);
  const errorText = (field: ConfirmField) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };

  function check() {
    const checked = parseConfirmForm((field) => values[field], today);
    if (!checked.ok) {
      setCheckErrors(checked.errors);
      return;
    }
    setCheckErrors(null);
    setConfirming(true);
  }

  function send() {
    setConfirming(false);
    const form = new FormData();
    form.set("caseId", caseId);
    form.set("version", String(version));
    form.set("from", from);
    if (districtId) form.set("districtId", String(districtId));
    for (const field of CONFIRM_FIELDS) form.set(field, values[field]);
    startTransition(() => dispatch(form));
  }

  return (
    <section aria-labelledby="confirm-title" className="flex flex-col gap-3.5 border-t pt-4">
      <h3 id="confirm-title" className="text-lg font-bold">
        {t("confirm.title")}
      </h3>
      <p className="text-[15px] text-[#3F4843]">{t("confirm.intro")}</p>
      {kindMissing && (
        <p className="rounded-lg bg-[#FFF4E0] px-4 py-3 text-[15px] font-semibold text-[#6B3A04]">
          {t("confirm.kindMissing")}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
        className="flex flex-col gap-4"
      >
        <ChoiceCards
          name="outcome"
          labelledBy="confirm-title"
          options={offered.map((value) => ({ value, label: t(`outcome.${value}`), hint: t(`outcomeHint.${value}`) }))}
          value={values.outcome}
          onChange={(value) => {
            set("outcome", value);
            setCheckErrors(null);
          }}
          error={errorText("outcome")}
        />

        {outcome === "inProgress" && (
          <>
            <div className="flex flex-col gap-3.5 rounded-lg border px-4.5 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[17px] font-bold">{t("confirm.release")}</span>
                <span className="text-xl font-bold">{formatRupees(RELEASE_AMOUNT)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="confirm-releasedOn"
                  type="date"
                  label={t("confirm.releasedOn")}
                  help={t("confirm.releasedOnHelp")}
                  max={today}
                  value={values.releasedOn}
                  onChange={change("releasedOn")}
                  error={errorText("releasedOn")}
                />
                <FormField
                  id="confirm-referenceNumber"
                  label={t("confirm.reference")}
                  value={values.referenceNumber}
                  onChange={change("referenceNumber")}
                  autoComplete="off"
                  error={errorText("referenceNumber")}
                />
              </div>
              <FormTextArea
                id="confirm-note"
                label={t("confirm.note")}
                rows={2}
                value={values.note}
                onChange={change("note")}
                error={errorText("note")}
              />
            </div>

            <fieldset className="flex flex-col gap-3 rounded-lg border px-4.5 py-4">
              <legend className="px-1 text-[17px] font-bold">{t("confirm.installments")}</legend>
              <p className="text-[15px] text-[#3F4843]">{t("confirm.installmentsHelp")}</p>
              {INSTALLMENT_NUMBERS.map((number) => {
                const name = tc(`installment.name.${number}`);
                const status = values[`status${number}`];
                const sheetNote = sheetInstallments[number - 1];
                return (
                  <div
                    key={number}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-4 border-t pt-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold">{name}</span>
                      <span className="text-sm text-muted-foreground">
                        {sheetNote ? t("confirm.sheetSaid", { note: sheetNote }) : t("confirm.sheetSaidNothing")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`confirm-status${number}`} className="text-base font-semibold">
                        {t("confirm.status", { installment: name })}
                      </Label>
                      <select
                        id={`confirm-status${number}`}
                        value={status}
                        onChange={change(`status${number}`)}
                        aria-invalid={errors[`status${number}`] ? true : undefined}
                        aria-describedby={errors[`status${number}`] ? `confirm-status${number}-error` : undefined}
                        className="h-12 rounded-lg border border-input bg-card px-3 text-base"
                      >
                        {INSTALLMENT_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {tc(`installment.status.${value}`)}
                          </option>
                        ))}
                      </select>
                      {errorText(`status${number}`) && (
                        <p id={`confirm-status${number}-error`} className="text-[15px] font-medium text-destructive">
                          {errorText(`status${number}`)}
                        </p>
                      )}
                    </div>
                    {status === "NOT_STARTED" ? (
                      <span />
                    ) : (
                      <FormField
                        id={`confirm-day${number}`}
                        type="date"
                        label={status === "RELEASED" ? t("confirm.paidOn") : t("confirm.expectedOn")}
                        max={status === "RELEASED" ? today : undefined}
                        value={values[`day${number}`]}
                        onChange={change(`day${number}`)}
                        error={errorText(`day${number}`)}
                      />
                    )}
                  </div>
                );
              })}
            </fieldset>
          </>
        )}

        {outcome && NEEDS_REASON.includes(outcome) && (
          <FormTextArea
            id="confirm-reason"
            label={outcome === "rejected" ? t("confirm.rejectReason") : t("confirm.stopReason")}
            help={t("confirm.reasonHelp")}
            rows={3}
            value={values.reason}
            onChange={change("reason")}
            error={errorText("reason")}
          />
        )}

        {outcome && <p className="text-[15px] text-[#3F4843]">{t(`confirm.after.${outcome}`)}</p>}
        {checkErrors === null && state.error && <FormError id="confirm-error" message={t(`errors.${state.error}`)} />}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="h-13 rounded-lg bg-primary px-6.5 text-[17px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {pending ? t("confirm.working") : t("confirm.save")}
          </button>
        </div>
      </form>

      <Modal open={confirming} onClose={() => setConfirming(false)} labelledBy="confirm-modal-title">
        <h2 id="confirm-modal-title" className="text-[22px] font-bold">
          {t("confirm.modalTitle")}
        </h2>
        {outcome && <p>{t("confirm.modalText", { name: caseName, outcome: t(`outcome.${outcome}`) })}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-12 rounded-lg border border-input px-6 text-[17px] font-semibold"
          >
            {t("confirm.modalBack")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={send}
            className="h-12 rounded-lg bg-primary px-6 text-[17px] font-bold text-primary-foreground"
          >
            {t("confirm.modalConfirm")}
          </button>
        </div>
      </Modal>
    </section>
  );
}
