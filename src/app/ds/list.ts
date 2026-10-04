import type { CaseStatus } from "@/generated/prisma/enums";
import type { CaseFilter } from "@/server/cases/queries";

/** HOME-2: the tabs and the statuses each one shows. */
export const TABS = {
  all: undefined,
  inProgress: ["IN_PROGRESS"],
  completed: ["COMPLETED"],
} as const satisfies Record<string, CaseStatus[] | undefined>;
export type Tab = keyof typeof TABS;

const isTab = (value: unknown): value is Tab => typeof value === "string" && Object.hasOwn(TABS, value);

/** The statuses a tab shows; undefined for every status. */
export const tabStatuses = (tab: Tab): CaseStatus[] | undefined => TABS[tab] && [...TABS[tab]];

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
  return { tab, q, filter: { q, statuses: tabStatuses(tab) } };
}
