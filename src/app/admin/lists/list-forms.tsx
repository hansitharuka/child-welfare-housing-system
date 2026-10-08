"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, FormField, FormNotice } from "@/components/forms/form-field";
import { LOCALES } from "@/i18n/locales";
import { type Names, nameField } from "@/lib/names";
import type { ListFormState } from "./actions";

type Action = (state: ListFormState, form: FormData) => Promise<ListFormState>;
type Field = { name: string; label: string; help?: string; width?: string };

const START: ListFormState = { errors: {}, error: null, saves: 0, written: false };

/**
 * A small form for adding or renaming a list entry (LST-2, LST-4). The admin types the name in the screen's
 * language; the other two languages are optional, under "the name in the other languages", and the system
 * writes any left blank (UI-9). Fields are controlled, so a refused save keeps what was typed; after a save,
 * an "add" form clears itself.
 */
function ListForm({
  id,
  action,
  names,
  width,
  extra = [],
  submitLabel,
  clearAfterSave,
  onSaved,
  onCancel,
}: {
  id: string;
  action: Action;
  /** The current names, when renaming. */
  names?: Names;
  width?: string;
  /** Fields after the name, such as an office's code. */
  extra?: Field[];
  submitLabel: string;
  clearAfterSave: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("lists");
  const locale = useLocale();
  const main: Field = { name: nameField(locale), label: t("name"), width };
  const others: Field[] = LOCALES.filter((other) => other !== locale).map((other) => {
    const name = nameField(other);
    return { name, label: t(name), width };
  });
  const initial = () => ({
    nameSi: "",
    nameTa: "",
    nameEn: "",
    ...names,
    ...Object.fromEntries(extra.map((f) => [f.name, ""])),
  });
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [othersOpen, setOthersOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: ListFormState, form: FormData) => {
    const next = await action(previous, form);
    if (next.saves > previous.saves) {
      if (clearAfterSave) {
        setValues(initial());
        setOthersOpen(false);
      }
      onSaved?.();
    } else if (others.some((field) => next.errors[field.name])) setOthersOpen(true);
    return next;
  }, START);

  const input = (field: Field) => (
    <div key={field.name} className={field.width ?? "w-64"}>
      <FormField
        id={`${id}-${field.name}`}
        name={field.name}
        label={field.label}
        help={field.help}
        value={values[field.name]}
        onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))}
        error={state.errors[field.name] ? t(`errors.${state.errors[field.name]}`) : undefined}
      />
    </div>
  );

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="from" value={locale} />
      <div className="flex flex-wrap items-start gap-3">{[main, ...extra].map(input)}</div>
      <details open={othersOpen} onToggle={(event) => setOthersOpen(event.currentTarget.open)}>
        <summary className="w-fit cursor-pointer text-[15px] font-semibold text-primary">{t("otherNames")}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("otherNamesHint")}</p>
          <div className="flex flex-wrap items-start gap-3">{others.map(input)}</div>
        </div>
      </details>
      {state.error && <FormError id={`${id}-error`} message={t(`errors.${state.error}`)} />}
      {clearAfterSave && state.saves > 0 && !state.error && (
        <FormNotice message={t(state.written ? "addedWritten" : "added")} />
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-lg border border-input px-5 text-base font-semibold"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

export function AddOfficeForm({ action }: { action: Action }) {
  const t = useTranslations("lists");
  return (
    <ListForm
      id="add-office"
      action={action}
      clearAfterSave
      submitLabel={t("add")}
      extra={[{ name: "code", label: t("code"), help: t("codeHint"), width: "w-72" }]}
    />
  );
}

export function AddStageForm({ id, action }: { id: string; action: Action }) {
  const t = useTranslations("lists");
  return <ListForm id={id} action={action} width="w-full" clearAfterSave submitLabel={t("add")} />;
}

/** A "rename" button that opens the rename form in place. */
export function RenameInPlace({
  id,
  label,
  action,
  names,
  width,
}: {
  id: string;
  label: string;
  action: Action;
  names: Names;
  width?: string;
}) {
  const t = useTranslations("lists");
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={label}
        className="h-10 rounded-lg border border-input px-3 text-[15px] font-semibold"
      >
        {t("rename")}
      </button>
    );
  }
  return (
    <div className="w-full basis-full rounded-lg bg-muted p-3">
      <ListForm
        id={id}
        action={action}
        names={names}
        width={width}
        submitLabel={t("save")}
        clearAfterSave={false}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
