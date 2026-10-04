import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { caseName } from "@/components/cases/page-header";
import { ExportLink } from "@/components/cases/export-link";
import { Pager } from "@/components/cases/pager";
import { StatusChip } from "@/components/cases/status-chip";
import { FormNotice } from "@/components/forms/form-field";
import { formatDate } from "@/lib/dates";
import { listCases, PAGE_SIZE } from "@/server/cases/queries";
import { isBeingEntered } from "@/server/cases/rules";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { districtsWithOffices } from "@/server/lists/queries";
import { CaseFilters } from "./case-filters";
import { FILTERS, filterQuery, positive, readFilters, STATUSES } from "./filters";

/** FND-1: every case, filterable by name, NIC, number, district, DS, status, category and kind. */
export default async function HoCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireRole("HO_OFFICER");
  const params = await searchParams;
  const read = (key: string) => (typeof params[key] === "string" ? params[key] : "");
  const { values, filter } = readFilters(read);
  const page = positive(read("page")) ?? 1;

  const [t, districts, list] = await Promise.all([
    getTranslations("cases"),
    districtsWithOffices(db),
    listCases(db, viewer, { ...filter, page }),
  ]);

  const withQuery = (path: string, query: URLSearchParams) => (query.size > 0 ? `${path}?${query}` : path);
  const pageHref = (p: number) => {
    const query = filterQuery(values);
    if (p > 1) query.set("page", String(p));
    return withQuery("/ho/cases", query);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-snug font-bold">{t("list.title")}</h1>
          <p className="text-muted-foreground">{t("list.summary", { total: list.total })}</p>
        </div>
        <div className="flex items-center gap-3">
          {list.total > 0 && (
            <ExportLink
              href={withQuery("/ho/cases/export", filterQuery(values))}
              label={t("export.button")}
              hint={t("export.hint")}
            />
          )}
          {/* The old sheet's layout leaves drafts out (EXP-2), so a list of drafts has nothing to give. */}
          {list.total > 0 && filter.statuses?.[0] !== "DRAFT" && (
            <ExportLink
              href={withQuery("/ho/cases/export/sheet", filterQuery(values))}
              label={t("export.sheetLayout.button")}
              hint={t("export.sheetLayout.hint")}
            />
          )}
          <Link
            href="/ho/cases/new"
            className="flex h-13 items-center rounded-lg bg-primary px-6 text-[17px] font-semibold text-primary-foreground"
          >
            + {t("list.add")}
          </Link>
        </div>
      </div>

      {read("notice") === "deleted" && <FormNotice message={t("notices.deleted")} />}

      <section aria-labelledby="cases-title" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="cases-title" className="sr-only">
          {t("list.title")}
        </h2>
        <CaseFilters
          // "Clear" changes the address without leaving the page; a new form shows the new choices.
          key={FILTERS.map((key) => values[key]).join("|")}
          values={values}
          districts={districts}
          statuses={STATUSES}
        />
        {list.rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted-foreground">{t("list.empty")}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="bg-muted/60 text-[15px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">
                  {t("list.columns.beneficiary")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  {t("list.columns.office")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  {t("list.columns.kind")}
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  {t("list.columns.status")}
                </th>
                <th scope="col" className="px-5 py-2.5 font-semibold">
                  {t("list.columns.updated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-accent/60">
                  <td className="px-5 py-2.5">
                    <Link
                      href={isBeingEntered(row.status) ? `/ho/cases/${row.id}/edit` : `/ho/cases/${row.id}`}
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
                  <td className="px-3 py-2.5">
                    <span className="flex flex-col">
                      <span>{row.officeName}</span>
                      <span className="text-sm text-muted-foreground">{row.districtName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{row.kind ? t(`kindShort.${row.kind}`) : t("none")}</td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={row.status} />
                  </td>
                  <td className="px-5 py-2.5 tabular-nums">{formatDate(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={list.total} href={pageHref} />
      </section>
    </div>
  );
}
