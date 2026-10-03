"use client";

import { useEffect, useRef } from "react";

const WIDTH = { normal: "w-[560px]", wide: "w-[720px]", photo: "w-[1040px]" } as const;

/**
 * A pop-up built on the browser's own <dialog>: it keeps keyboard focus inside while open,
 * closes on Escape, and gives the page behind it an inert backdrop (UI-6).
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  size = "normal",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  /** "wide" for a longer form, "photo" for the photo viewer. */
  size?: keyof typeof WIDTH;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      className={`m-auto ${WIDTH[size]} max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-0 bg-card p-7 text-left text-foreground shadow-2xl backdrop:bg-black/45`}
    >
      {open && <div className="flex flex-col gap-4">{children}</div>}
    </dialog>
  );
}
