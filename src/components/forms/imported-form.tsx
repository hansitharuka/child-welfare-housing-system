"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormError, FormField } from "@/components/forms/form-field";
import { isValidNic, normaliseNic } from "@/lib/nic";
import { type CaseErrors, IMPORTED_FIELDS, type ImportedField, KINDS, parseImportedForm } from "@/lib/validation/case";
import type { CaseCommandError } from "@/server/cases/commands";
import type { NicMatch } from "@/server/cases/duplicates";
import { ChoiceCards } from "./case-form";
import { NicMatches } from "./nic-matches";

export type ImportedFormState = { errors: CaseErrors; error: CaseCommandError | null };

const EMPTY: ImportedFormState = { errors: {}, error: null };

/**
 * IMP-5: what the DS office fills in on a case brought in from the old sheet, until Head Office
 * confirms it: the kind of help, the NIC and the phone numbers. Empty fields may stay empty; filled ones
 * get the case form's checks, in the browser and again on the server. The NIC is compared with other
 * cases as on the case form (CASE-6). Where the sheet's NIC or phone cell couldn't be stored, it is
 * shown as written, to copy from.
 */
export function ImportedForm({
  caseId,
  version,
  atRisk,
  initial,
  sheet,
  actions,
}: {
  caseId: string;
  /** The version the form was opened with (CASE-10). */
  version: number;
  atRisk: boolean;
  initial: Record<ImportedField, string>;
  sheet: { nic?: string; phone?: string };
  actions: {
    save: (state: ImportedFormState, form: FormData) => Promise<ImportedFormState>;
    checkNic: (nic: string, caseId: string, dsOfficeId: number | null) => Promise<NicMatch[]>;
  };
}) {
  const t = useTranslations("cases");
  const [state, dispatch, pending] = useActionState(actions.save, EMPTY);
  const [, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  // Checks made in the browser; null once the form has gone to the server, whose answer then shows.
  const [localErrors, setLocalErrors] = useState<CaseErrors | null>(null);
  const [failedTries, setFailedTries] = useState(0);
  const [nicCheck, setNicCheck] = useState<{ nic: string; matches: NicMatch[] } | null>(null);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failedTries > 0) summary.current?.focus();
  }, [failedTries]);

  const errors = localErrors ?? state.errors;
  const serverError = localErrors === null ? state.error : null;
  const errorText = (field: ImportedField) => {
    const key = errors[field];
    return key ? t(`form.errors.${key}`) : undefined;
  };
  const set = (field: ImportedField) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function lookUp(raw: string) {
    const nic = normaliseNic(raw);
    if (!isValidNic(nic)) return;
    try {
      setNicCheck({ nic, matches: await actions.checkNic(nic, caseId, null) });
    } catch {
      // The warning never blocks anything (CASE-6).
    }
  }
  const matches = nicCheck && nicCheck.nic === normaliseNic(values.nic) ? nicCheck.matches : [];

  function attempt() {
    const checked = parseImportedForm((field) => values[field]);
    if (!checked.ok) {
      setLocalErrors(checked.errors);
      setFailedTries((n) => n + 1);
      return;
    }
    setLocalErrors(null);
    const form = new FormData();
    form.set("id", caseId);
    form.set("version", String(version));
    for (const field of IMPORTED_FIELDS) form.set(field, values[field]);
    startTransition(() => dispatch(form));
  }

  const errorList = IMPORTED_FIELDS.flatMap((field) => {
    const message = errorText(field);
    return message ? [{ field, message }] : [];
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        attempt();
      }}
      className="flex max-w-4xl flex-col gap-5"
    >
      <p className="rounded-lg bg-[#E4EDF8] px-4 py-3 text-[15px] text-[#1E4E8C]">{t("fill.intro")}</p>

      <section aria-labelledby="kind-title" className="flex flex-col gap-4 rounded-xl border bg-card px-6 py-5">
        <h2 id="kind-title" className="text-xl font-bold">
          {t("fill.kind")}
        </h2>
        <ChoiceCards
          name="kind"
          labelledBy="kind-title"
          options={KINDS.map((value) => ({ value, label: t(`kind.${value}`), hint: t(`kindHint.${value}`) }))}
          value={values.kind}
          onChange={(value) => setValues((v) => ({ ...v, kind: value }))}
          error={errorText("kind")}
        />
      </section>

      <section aria-labelledby="contact-title" className="flex flex-col gap-4 rounded-xl border bg-card px-6 py-5">
        <h2 id="contact-title" className="text-xl font-bold">
          {t("form.partDetails")}
        </h2>
        <div className="grid grid-cols-2 gap-5">
          <FormField
            id="nic"
            label={atRisk ? t("fill.guardianNic") : t("fill.nic")}
            help={t("form.nicHelp")}
            value={values.nic}
            onChange={set("nic")}
            onBlur={() => void lookUp(values.nic)}
            autoComplete="off"
            error={errorText("nic")}
          />
        </div>
        {sheet.nic && <SheetWrote text={t("fill.sheetWrote", { value: sheet.nic })} />}
        {matches.length > 0 && <NicMatches matches={matches} />}
        <div className="grid grid-cols-2 gap-5">
          <FormField
            id="mobile1"
            type="tel"
            label={t("fill.mobile1")}
            value={values.mobile1}
            onChange={set("mobile1")}
            error={errorText("mobile1")}
          />
          <FormField
            id="mobile2"
            type="tel"
            label={t("fill.mobile2")}
            value={values.mobile2}
            onChange={set("mobile2")}
            error={errorText("mobile2")}
          />
        </div>
        {sheet.phone && <SheetWrote text={t("fill.sheetWrote", { value: sheet.phone })} />}
      </section>

      {errorList.length > 0 && (
        <div
          ref={summary}
          id="imported-errors"
          role="alert"
          tabIndex={-1}
          className="flex flex-col gap-1.5 rounded-lg border-2 border-destructive bg-destructive/5 px-5 py-4 text-[#8F1B12]"
        >
          <p className="text-[17px] font-bold">{t("form.errors.summaryDraft")}</p>
          <ul className="flex flex-col gap-1 text-[15px]">
            {errorList.map((item) => (
              <li key={item.field}>
                <a
                  href={item.field === "kind" ? "#kind-title" : `#${item.field}`}
                  className="underline underline-offset-2"
                >
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {serverError && <FormError id="imported-error" message={t(`form.errors.${serverError}`)} />}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="h-13 rounded-lg bg-primary px-7 text-[17px] font-bold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t("form.saving") : t("fill.save")}
        </button>
      </div>
    </form>
  );
}

/** The old sheet's cell as written, beside the fields it belongs to. */
function SheetWrote({ text }: { text: string }) {
  return <p className="rounded-lg bg-muted px-4 py-2.5 text-[15px] break-words text-[#3F4843]">{text}</p>;
}
