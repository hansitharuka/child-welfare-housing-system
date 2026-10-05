"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "./form-field";

/** A FormField for a password, with an eye button that shows or hides what was typed. */
export function PasswordField(props: Omit<React.ComponentProps<typeof FormField>, "type" | "trailing">) {
  const t = useTranslations("passwordField");
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;

  return (
    <FormField
      {...props}
      type={shown ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t("hide") : t("show")}
          aria-controls={props.id}
          title={shown ? t("hide") : t("show")}
          className="flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      }
    />
  );
}
