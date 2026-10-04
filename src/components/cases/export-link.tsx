import { Download } from "lucide-react";

/**
 * EXP-1: downloads the list as an Excel file, with every case its filters match. A plain link, not
 * Next's <Link>: the address is a file, not a page to move to.
 */
export function ExportLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a
      href={href}
      download
      title={hint}
      className="flex h-13 items-center gap-2 rounded-lg border border-primary bg-card px-5 text-[17px] font-semibold text-primary"
    >
      <Download aria-hidden className="size-5" />
      {label}
    </a>
  );
}
