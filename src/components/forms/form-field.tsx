import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled text input in the prototype's size: 48 px tall, 17 px text (UI-4, UI-6). */
export function FormField({
  id,
  label,
  help,
  invalid,
  errorId,
  ...inputProps
}: {
  id: string;
  label: string;
  help?: string;
  invalid?: boolean;
  errorId?: string;
} & Omit<React.ComponentProps<"input">, "id">) {
  const helpId = help ? `${id}-help` : undefined;
  const describedBy = [helpId, invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-12 rounded-lg px-3.5 text-[17px] md:text-[17px]"
        {...inputProps}
      />
      {help && (
        <span id={helpId} className="text-sm text-muted-foreground">
          {help}
        </span>
      )}
    </div>
  );
}

/** The error box shown above a form's submit button (ERR-1). */
export function FormError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="rounded-lg border-2 border-destructive bg-destructive/5 px-4 py-3 text-[15px] font-medium text-destructive"
    >
      {message}
    </p>
  );
}
