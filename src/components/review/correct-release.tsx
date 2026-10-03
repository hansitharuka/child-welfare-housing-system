"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ReleaseState } from "@/app/ho/check/actions";
import { Modal } from "@/components/modal";
import type { ReleaseDateLimits } from "@/lib/validation/release";
import { ReleaseForm, type ReleaseFormValues } from "./release-form";

/** REL-4: Head Office corrects the release's date, reference number or note, in a pop-up. */
export function CorrectRelease({
  caseId,
  version,
  limits,
  current,
  action,
}: {
  caseId: string;
  version: number;
  limits: ReleaseDateLimits;
  current: ReleaseFormValues;
  action: (state: ReleaseState, form: FormData) => Promise<ReleaseState>;
}) {
  const t = useTranslations("review");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 self-start rounded-lg border border-primary bg-card px-4.5 font-semibold text-primary"
      >
        {t("correct.button")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="correct-release-title">
        <h2 id="correct-release-title" className="text-[22px] font-bold">
          {t("correct.title")}
        </h2>
        <ReleaseForm
          caseId={caseId}
          version={version}
          from="case"
          limits={limits}
          initial={current}
          mode="correct"
          action={action}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
