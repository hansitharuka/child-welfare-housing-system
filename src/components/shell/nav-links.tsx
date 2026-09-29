"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavLinkItem = { href: string; label: string; exact?: boolean };

export function NavLinks({ label, items }: { label: string; items: NavLinkItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex h-14 shrink-0 items-stretch gap-2 border-b border-border bg-card px-6">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center border-b-[3px] px-4 text-[17px] transition-colors",
              active
                ? "border-primary font-bold text-primary"
                : "border-transparent font-medium text-muted-foreground hover:text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
