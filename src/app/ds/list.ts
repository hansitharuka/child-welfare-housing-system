import type { CaseFilter } from "@/server/cases/queries";

/** HOME-2: the home page's tabs, in order. */
export const TABS = ["all", "inProgress", "completed"] as const;
export type Tab = (typeof TABS)[number];

const isTab = (value: unknown): value is Tab => TABS.includes(value as Tab);

/** The cases a tab shows. */
export function tabFilter(tab: Tab): Omit<CaseFilter, "q" | "page"> {
  switch (tab) {
    case "all":
      return {};
    case "inProgress":
      return { statuses: ["IN_PROGRESS"] };
    case "completed":
      return { statuses: ["COMPLETED"] };
  }
}

/**
 * HOME-2: the DS officer's list from the address, a tab and a search. The home page and its Excel
 * export (EXP-1) both read it here, so the file holds the cases the screen shows.
 */
export function readHomeList(params: { tab?: unknown; q?: unknown }): {
  tab: Tab;
  q: string;
  filter: Omit<CaseFilter, "page">;
} {
  const tab: Tab = isTab(params.tab) ? params.tab : "all";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  return { tab, q, filter: { ...tabFilter(tab), q } };
}
