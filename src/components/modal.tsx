"use client";

import { useEffect, useRef } from "react";

/**
 * A pop-up built on the browser's own <dialog>: it keeps keyboard focus inside while open,
 * closes on Escape, and gives the page behind it an inert backdrop (UI-6).
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
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
      className="m-auto w-[560px] max-w-[calc(100vw-2rem)] rounded-xl border-0 bg-card p-7 text-foreground shadow-2xl backdrop:bg-black/45"
    >
      {open && <div className="flex flex-col gap-4">{children}</div>}
    </dialog>
  );
}
