"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, FormField, FormNotice } from "@/components/forms/form-field";
import type { ListFormState } from "./actions";

type Action = (state: ListFormState, form: FormData) => Promise<ListFormState>;
type Field = { name: string; label: string; help?: string; initial?: string; width?: string };

const START: ListFormState = { errors: {}, error: null, saves: 0 };

/**
 * A small form for adding or renaming a list entry (LST-2, LST-4). Fields are controlled, so a refused
 * save keeps what was typed; after a save, an "add" form clears itself.
 */
function ListForm({
  id,
  action,
  fields,
  submitLabel,
  clearAfterSave,
  onSaved,
  onCancel,
}: {
  id: string;
  action: Action;
  fields: Field[];
  submitLabel: string;
  clearAfterSave: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("lists");
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [state, formAction, pending] = useActionState(async (previous: ListFormState, form: FormData) => {
    const next = await action(previous, form);
    if (next.saves > previous.saves) {
      if (clearAfterSave) setValues(initial());
      onSaved?.();
    }
    return next;
  }, START);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-start gap-3">
        {fields.map((field) => (
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
        ))}
      </div>
      {state.error && <FormError id={`${id}-error`} message={t(`errors.${state.error}`)} />}
      {clearAfterSave && state.saves > 0 && !state.error && <FormNotice message={t("added")} />}
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
      fields={[
        { name: "nameSi", label: t("nameSi") },
        { name: "nameEn", label: t("nameEn") },
        { name: "code", label: t("code"), help: t("codeHint"), width: "w-72" },
      ]}
    />
  );
}

export function AddStageForm({ id, action }: { id: string; action: Action }) {
  const t = useTranslations("lists");
  return (
    <ListForm
      id={id}
      action={action}
      clearAfterSave
      submitLabel={t("add")}
      fields={[{ name: "nameSi", label: t("stageName"), width: "w-full" }]}
    />
  );
}

/** A "rename" button that opens the rename form in place. */
export function RenameInPlace({
  id,
  label,
  action,
  fields,
}: {
  id: string;
  label: string;
  action: Action;
  fields: Field[];
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
        fields={fields}
        submitLabel={t("save")}
        clearAfterSave={false}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
