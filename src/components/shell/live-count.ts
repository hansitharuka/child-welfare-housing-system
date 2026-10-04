"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LiveCount } from "./types";

type Reading = { count: number; at: number };

const isReading = (value: unknown): value is Reading =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as Reading).count) &&
  Number.isFinite((value as Reading).at);

/**
 * The menu's waiting count or the bell's unread count, kept in step with the page beside it (NTF-1).
 * The layout's reading stays until the next full load or a change that refreshes the layout, so after
 * each client-side move the count is read again from `source`. Whichever reading is newer is shown:
 * a refreshed layout wins over an earlier read, a read wins over an older layout.
 */
export function useLiveCount(live: LiveCount): number {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = `${pathname}?${search}`;
  const shownFor = useRef(location);
  const [read, setRead] = useState<Reading | null>(null);

  useEffect(() => {
    // The first render already has the layout's reading.
    if (shownFor.current === location) return;
    shownFor.current = location;
    const controller = new AbortController();
    fetch(live.source, { cache: "no-store", signal: controller.signal })
      // A session that has ended answers with the sign-in page; the move itself goes there too.
      .then((response) => (response.ok && !response.redirected ? response.json() : null))
      .then((body: unknown) => {
        if (isReading(body)) setRead(body);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [location, live.source]);

  return read && read.at > live.at ? read.count : live.count;
}
