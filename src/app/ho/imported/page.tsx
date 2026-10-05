import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { caseFieldRows } from "@/components/cases/case-view";
import { caseName } from "@/components/cases/page-header";
import { Pager } from "@/components/cases/pager";
import { SheetNotesSection } from "@/components/cases/sheet-notes";
import { ConfirmImport } from "@/components/review/confirm-import";
import { DuplicateCases } from "@/components/review/duplicate-cases";
import { ReviewNotice } from "@/components/review/review-notice";
import { colomboDay } from "@/lib/dates";
import { duplicatesInFull } from "@/server/cases/duplicates";
import { getCase, PAGE_SIZE } from "@/server/cases/queries";
import { importedByDistrict, listImported } from "@/server/cases/queues";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { positive } from "../cases/filters";
import { confirmImportAction } from "./actions";

/**
 * IMP-5: the cases brought in from the old sheet, for Head Office to confirm one by one, laid out like
 * the check screen (CHK-1): the list on the left, in the sheet's order, and the chosen case on the
 * right, with its details, any other case with its NIC (CHK-2), the sheet's notes and the confirmation.
 */
export default async function HoImportedPage({
  searchParams,
}: {
  searchParams: Promise<{
    case?: string | string[];
    page?: string | string[];
    districtId?: string | string[];
    notice?: string | string[];
    done?: string | string[];
  }>;
}) {
  const viewer = await requireRole("HO_OFFICER");
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);
  const page = Math.max(1, Number(params.page) || 1);
  const districtId = positive(one(params.districtId) ?? "");

  const [t, tc, districts, list] = await Promise.all([
    getTranslations("imported"),
    getTranslations("cases"),
    importedByDistrict(db, viewer),
    listImported(db, viewer, { page, districtId }),
  ]);
  const wanted = one(params.case);
  const selectedId = list.rows.find((row) => row.id === wanted)?.id ?? list.rows[0]?.id ?? null;
  const done = one(params.done);
  const [details, doneDetails] = await Promise.all([
    selectedId ? getCase(db, viewer, selectedId) : null,
    done ? getCase(db, viewer, done) : null,
  ]);
  const duplicates = details?.nic
    ? await duplicatesInFull(db, viewer, { caseId: details.id, nic: details.nic, dsOfficeId: details.dsOfficeId })
    : [];

  const href = (changes: { case?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (districtId) query.set("districtId", String(districtId));
    const nextPage = changes.page ?? page;
    if (nextPage > 1) query.set("page", String(nextPage));
    if (changes.case) query.set("case", changes.case);
    const text = query.toString();
    return text ? `/ho/imported?${text}` : "/ho/imported";
  };
  const sheetPlace = (row: { category: string | null; sheetRow: number | null; sheetSerial: number | null }) =>
    t("sheetPlace", {
      tab: row.category === "CHILD_AT_RISK" ? tc("category.CHILD_AT_RISK") : tc("category.CARE_LEAVER"),
      row: row.sheetRow ?? 0,
      serial: row.sheetSerial ?? 0,
      hasSerial: row.sheetSerial === null ? "no" : "yes",
    });

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[28px] leading-snug font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <ReviewNotice notice={params.notice} details={doneDetails} />

      {/* A plain GET form: the district is in the address, so the list can be shared and reloaded. */}
      <form
        key={districtId ?? "all"}
        action="/ho/imported"
        className="flex flex-wrap items-end gap-3"
        aria-label={t("filterLabel")}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="districtId" className="text-base font-semibold">
            {t("district")}
          </label>
          <select
            id="districtId"
            name="districtId"
            defaultValue={districtId ? String(districtId) : ""}
            className="h-11 min-w-64 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">{t("allDistricts")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {t("districtOption", { name: d.name, count: d.count })}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-11 rounded-lg border border-input bg-card px-5 font-semibold">
          {t("show")}
        </button>
        <p className="ml-auto text-[17px] font-semibold">{t("count", { count: list.total })}</p>
      </form>

      <div className="flex items-start gap-6">
        <section aria-labelledby="imported-list-title" className="flex w-[400px] shrink-0 flex-col gap-2.5">
          <h2 id="imported-list-title" className="sr-only">
            {t("listLabel")}
          </h2>
          {list.rows.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {list.rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <Link
                      href={href({ case: row.id })}
                      aria-current={selected ? "true" : undefined}
                      className={`flex flex-col gap-0.5 rounded-xl border-2 px-4 py-3.5 ${
                        selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/60"
                      }`}
                    >
                      <span className="text-[17px] font-bold">{caseName(tc, row.name, row.childName)}</span>
                      <span className="text-[15px] text-muted-foreground">
                        {t("rowOffice", { office: row.officeName })}
                      </span>
                      <span className="text-sm text-[#3F4843]">{sheetPlace(row)}</span>
                      {row.kindMissing && (
                        <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#8A4A06]">
                          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                          {t("kindMissingFlag")}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} href={(p) => href({ page: p })} />
        </section>

        {details && (
          <section
            aria-labelledby="case-title"
            className="flex min-w-0 flex-1 flex-col gap-4.5 rounded-xl border bg-card px-6.5 py-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="case-title" className="text-2xl font-bold">
                  {caseName(tc, details.name, details.childName)}
                </h2>
                <p className="text-muted-foreground">
                  {t("subtitle", { office: details.officeName, district: details.districtName })}
                  {" · "}
                  {details.sheetRef &&
                    sheetPlace({
                      category: details.category,
                      sheetRow: details.sheetRef.row,
                      sheetSerial: details.sheetRef.serial,
                    })}
                </p>
              </div>
              <Link href={`/ho/cases/${details.id}`} className="shrink-0 font-semibold text-primary underline">
                {t("openCase")}
              </Link>
            </div>

            <DuplicateCases matches={duplicates} />

            <dl className="grid grid-cols-[250px_minmax(0,1fr)] gap-x-4 gap-y-2.5">
              {caseFieldRows(tc, details).map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-semibold break-words whitespace-pre-line">{row.value}</dd>
                </div>
              ))}
            </dl>

            {details.sheetNotes && <SheetNotesSection notes={details.sheetNotes} />}

            <ConfirmImport
              key={`${details.id}-${details.version}`}
              caseId={details.id}
              version={details.version}
              from="queue"
              districtId={districtId}
              caseName={caseName(tc, details.name, details.childName)}
              kindMissing={details.kind === null}
              today={colomboDay(new Date())}
              sheetInstallments={details.sheetNotes?.installments ?? []}
              action={confirmImportAction}
            />
          </section>
        )}
      </div>
    </div>
  );
}
