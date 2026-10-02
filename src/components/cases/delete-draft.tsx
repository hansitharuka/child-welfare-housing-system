"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-field";
import { Modal } from "@/components/modal";
import type { CaseCommandError } from "@/server/cases/commands";

/** CASE-8: deletes a draft after asking once. On success the action moves to the list. */
export function DeleteDraft({
  caseId,
  action,
}: {
  caseId: string;
  action: (caseId: string) => Promise<{ error: CaseCommandError | null }>;
}) {
  const t = useTranslations("cases");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<CaseCommandError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="h-12 self-start rounded-lg border border-destructive px-5 text-[17px] font-semibold text-destructive"
      >
        {t("deleteDraft.button")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="delete-draft-title">
        <h2 id="delete-draft-title" className="text-[22px] font-bold">
          {t("deleteDraft.title")}
        </h2>
        <p>{t("deleteDraft.text")}</p>
        {error && <FormError id="delete-draft-error" message={t(`form.errors.${error}`)} />}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 rounded-lg border border-input px-6 text-[17px] font-semibold"
          >
            {t("deleteDraft.cancel")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action(caseId);
                if (result.error) setError(result.error);
              })
            }
            className="h-12 rounded-lg bg-destructive px-6 text-[17px] font-semibold text-white"
          >
            {pending ? t("deleteDraft.working") : t("deleteDraft.confirm")}
          </button>
        </div>
      </Modal>
    </>
  );
}
