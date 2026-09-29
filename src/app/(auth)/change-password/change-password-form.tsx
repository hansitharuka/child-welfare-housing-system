"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { changePassword, type ChangePasswordState } from "../actions";

export function ChangePasswordForm() {
  const t = useTranslations("changePassword");
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePassword, { error: null });
  const currentInvalid = state.error === "currentWrong" || state.error === "required";
  const nextInvalid = state.error !== null && state.error !== "currentWrong";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormField
        id="current"
        name="current"
        type="password"
        label={t("current")}
        autoComplete="current-password"
        invalid={currentInvalid}
        errorId="change-password-error"
        required
      />
      <FormField
        id="next"
        name="next"
        type="password"
        label={t("next")}
        help={t("nextHelp")}
        autoComplete="new-password"
        minLength={10}
        invalid={nextInvalid}
        errorId="change-password-error"
        required
      />
      <FormField
        id="confirm"
        name="confirm"
        type="password"
        label={t("confirm")}
        autoComplete="new-password"
        invalid={nextInvalid}
        errorId="change-password-error"
        required
      />
      {state.error && <FormError id="change-password-error" message={t(`errors.${state.error}`)} />}
      <Button type="submit" disabled={pending} className="h-12 rounded-lg text-[17px] font-semibold">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
