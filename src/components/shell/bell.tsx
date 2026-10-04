"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveCount } from "./live-count";
import type { LiveCount } from "./types";

/** NTF-1: the header's bell, with how many notifications are unread; it leads to the list of them. */
export function Bell({ href, unread }: { href: string; unread: LiveCount }) {
  const t = useTranslations("notifications");
  const count = useLiveCount(unread);
  return (
    <Link
      href={href}
      aria-label={count > 0 ? t("bellUnread", { count }) : t("bell")}
      className="relative flex size-10 items-center justify-center rounded-lg hover:bg-white/10"
    >
      <BellIcon aria-hidden="true" className="size-6" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-notice px-1.5 text-[13px] font-bold text-notice-foreground"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
