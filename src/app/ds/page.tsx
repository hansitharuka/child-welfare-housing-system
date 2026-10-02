import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { caseName } from "@/components/cases/page-header";
import { Pager } from "@/components/cases/pager";
import { StatusChip } from "@/components/cases/status-chip";
import { FormNotice } from "@/components/forms/form-field";
import type { CaseStatus } from "@/generated/prisma/enums";
import { daysBetween, formatDate } from "@/lib/dates";
import { canEditDetails } from "@/server/cases/rules";
import {
  type CaseFilter,
  type CaseRow,
  countCases,
  listCases,
  officeSummary,
  PAGE_SIZE,
  todoItems,
} from "@/server/cases/queries";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";

/** HOME-2: the tabs and the statuses each one shows. */
const TABS = {
  all: undefined,
  inProgress: ["IN_PROGRESS"],
  completed: ["COMPLETED"],
} as const satisfies Record<string, CaseStatus[] | undefined>;
type Tab = keyof typeof TABS;

const isTab = (value: unknown): value is Tab => typeof value === "string" && value in TABS;

/** HOME-1 to HOME-3: the DS officer's own cases, with what needs doing next to them. */
export default async function DsHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
    q?: string | string[];
    page?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const viewer = await requireRole("DS_OFFICER");
  const office = viewer.dsOfficeId ? await officeSummary(db, viewer.dsOfficeId) : null;
  if (!office) notFound();

  const params = await searchParams;
  const tab: Tab = isTab(params.tab) ? params.tab : "all";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const filter: CaseFilter = { q, statuses: TABS[tab] ? [...TABS[tab]] : undefined, page };

  const [t, list, counts, todo] = await Promise.all([
    getTranslations("cases"),
    listCases(db, viewer, filter),
    Promise.all(
      (Object.keys(TABS) as Tab[]).map((key) => countCases(db, viewer, { statuses: TABS[key] && [...TABS[key]] })),
    ),
    todoItems(db, viewer),
  ]);
  const now = new Date();
  const href = (changes: { tab?: Tab; page?: number }) => {
    const query = new URLSearchParams();
    const nextTab = changes.tab ?? tab;
    if (nextTab !== "all") query.set("tab", nextTab);
    if (q) query.set("q", q);
    if (changes.page && changes.page > 1) query.set("page", String(changes.page));
    const text = query.toString();
    return text ? `/ds?${text}` : "/ds";
  };

  /** What comes next for the case, in the progress column. Phase 6 adds the installments and the stage reached. */
  const progress = (row: CaseRow) => {
    switch (row.status) {
      case "SUBMITTED": {
        const days = row.submittedAt ? daysBetween(row.submittedAt, now) : 0;
        return days === 0 ? t("home.progress.submittedToday") : t("home.progress.SUBMITTED", { days });
      }
      case "DRAFT":
      case "RETURNED":
      case "VERIFIED":
      case "IN_PROGRESS":
      case "COMPLETED":
      case "IMPORTED":
        return t(`home.progress.${row.status}`);
      default:
        return t("none");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-snug font-bold">{t("home.title")}</h1>
          <p className="text-muted-foreground">
            {t("home.subtitle", { office: office.name, district: office.districtName })}
          </p>
        </div>
        {office.active && (
          <Link
            href="/ds/cases/new"
            className="flex h-13 items-center rounded-lg bg-primary px-6 text-[17px] font-semibold text-primary-foreground"
          >
            + {t("home.add")}
          </Link>
        )}
      </div>

      {params.notice === "deleted" && <FormNotice message={t("notices.deleted")} />}

      <div className="flex items-start gap-6">
        <section aria-labelledby="list-title" className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
          <h2 id="list-title" className="sr-only">
            {t("home.title")}
          </h2>
          <div className="flex flex-wrap items-center gap-4 border-b px-5 py-3.5">
            <nav aria-label={t("home.tabsLabel")} className="flex gap-1 rounded-lg bg-muted p-1">
              {(Object.keys(TABS) as Tab[]).map((key, index) => (
                <Link
                  key={key}
                  href={href({ tab: key, page: 1 })}
                  aria-current={tab === key ? "page" : undefined}
                  className={`flex h-10.5 items-center rounded-md px-4.5 font-semibold ${
                    tab === key ? "bg-card text-primary shadow-sm" : "text-[#3F4843]"
                  }`}
                >
                  {t(`home.tabs.${key}`, { count: counts[index] ?? 0 })}
                </Link>
              ))}
            </nav>
            <form method="get" action="/ds" className="ms-auto flex items-center gap-2">
              {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
              <label htmlFor="q" className="sr-only">
                {t("home.search")}
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder={t("home.searchPlaceholder")}
                className="h-11.5 w-80 rounded-lg border border-input bg-card px-3.5 text-base"
              />
              <button type="submit" className="h-11.5 rounded-lg border border-primary px-4 font-semibold text-primary">
                {t("home.search")}
              </button>
            </form>
          </div>

          {list.rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground">
              {counts[0] === 0 ? t("home.emptyStart") : t("home.empty")}
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="bg-muted/60 text-[15px] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">
                    {t("home.columns.beneficiary")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("home.columns.kind")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("home.columns.status")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("home.columns.paid")}
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">
                    {t("home.columns.progress")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-accent/60">
                    <td className="px-5 py-2.5">
                      <Link
                        href={
                          canEditDetails(viewer.role, row.status) ? `/ds/cases/${row.id}/edit` : `/ds/cases/${row.id}`
                        }
                        className="flex flex-col"
                      >
                        <span className="text-[17px] font-semibold text-primary underline-offset-2 hover:underline">
                          {caseName(t, row.name, row.childName)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {row.caseNumber ?? t("noNumber")}
                          {row.category && ` · ${t(`category.${row.category}`)}`}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.kind ? t(`kindShort.${row.kind}`) : t("none")}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="px-3 py-2.5">{t("none")}</td>
                    <td className="px-5 py-2.5 text-[15px]">{progress(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} href={(p) => href({ page: p })} />
        </section>

        <aside
          aria-labelledby="todo-title"
          className="flex w-80 shrink-0 flex-col gap-3 rounded-xl border bg-card p-4.5"
        >
          <h2 id="todo-title" className="text-[19px] font-bold">
            {t("home.todo.title")}
          </h2>
          {todo.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">{t("home.todo.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {todo.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/ds/cases/${item.id}/edit`}
                    className={`flex flex-col gap-1 rounded-lg px-3.5 py-3 ${item.type === "returned" ? "bg-[#FBEBD3]" : "bg-muted"}`}
                  >
                    <span className="font-bold">
                      {t(item.type === "returned" ? "home.todo.returned" : "home.todo.draft", {
                        name: caseName(t, item.name, item.childName),
                      })}
                    </span>
                    <span className="text-[15px] text-[#3F4843]">
                      {item.type === "returned"
                        ? (item.reason ?? t("home.todo.noReason"))
                        : t("home.todo.draftText", { date: formatDate(item.updatedAt) })}
                    </span>
                    <span className="text-[15px] font-semibold text-primary">
                      {t(item.type === "returned" ? "home.todo.returnedAction" : "home.todo.draftAction")} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
