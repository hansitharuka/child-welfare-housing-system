"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { signIn, type SignInState } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null, username: "" });
  const invalid = state.error !== null;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormField
        id="username"
        name="username"
        label={t("username")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.username}
        invalid={invalid}
        errorId="sign-in-error"
        required
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label={t("password")}
        autoComplete="current-password"
        invalid={invalid}
        errorId="sign-in-error"
        required
      />
      {state.error && <FormError id="sign-in-error" message={t(`errors.${state.error}`)} />}
      <Button type="submit" disabled={pending} className="h-12 rounded-lg text-[17px] font-semibold">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
