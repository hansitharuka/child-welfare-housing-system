import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { caseFieldRows, DocumentLinks } from "@/components/cases/case-view";
import { caseName } from "@/components/cases/page-header";
import { Pager } from "@/components/cases/pager";
import { DecisionPanel } from "@/components/review/decision-panel";
import { DuplicateCases } from "@/components/review/duplicate-cases";
import { ReleaseForm } from "@/components/review/release-form";
import { ReviewNotice } from "@/components/review/review-notice";
import { colomboDay, daysBetween, formatDate } from "@/lib/dates";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { duplicatesInFull } from "@/server/cases/duplicates";
import { getCase, PAGE_SIZE } from "@/server/cases/queries";
import { listQueue, type Queue, queueCounts } from "@/server/cases/queues";
import { decideAction, releaseAction } from "./actions";

export type ReviewSearchParams = Promise<{
  case?: string | string[];
  page?: string | string[];
  notice?: string | string[];
  done?: string | string[];
}>;

const QUEUES: Queue[] = ["check", "release"];

/**
 * "පරීක්ෂා කිරීම සහ මුදල් නිදහස් කිරීම" as in the prototype (UI-7): two tabs, /ho/check (CHK-1) and
 * /ho/release (REL-1). The queue is on the left, longest waiting first; the chosen case is on the
 * right, with every field, its documents and NIC matches (CHK-2), and the decision (CHK-3) or the
 * release form (REL-2).
 */
export async function ReviewScreen({ queue, searchParams }: { queue: Queue; searchParams: ReviewSearchParams }) {
  const viewer = await requireRole("HO_OFFICER");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

  const [t, tc, counts, list] = await Promise.all([
    getTranslations("review"),
    getTranslations("cases"),
    queueCounts(db, viewer),
    listQueue(db, viewer, queue, page),
  ]);
  const wanted = one(params.case);
  const selectedId = list.rows.find((row) => row.id === wanted)?.id ?? list.rows[0]?.id ?? null;
  const done = one(params.done);
  const [details, doneDetails] = await Promise.all([
    selectedId ? getCase(db, viewer, selectedId) : null,
    done ? getCase(db, viewer, done) : null,
  ]);
  const duplicates =
    details && queue === "check"
      ? await duplicatesInFull(db, viewer, { caseId: details.id, nic: details.nic, dsOfficeId: details.dsOfficeId })
      : [];

  const now = new Date();
  const href = (changes: { case?: string; page?: number }) => {
    const query = new URLSearchParams();
    const nextPage = changes.page ?? page;
    if (nextPage > 1) query.set("page", String(nextPage));
    if (changes.case) query.set("case", changes.case);
    const text = query.toString();
    return text ? `/ho/${queue}?${text}` : `/ho/${queue}`;
  };

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[28px] leading-snug font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <ReviewNotice notice={params.notice} details={doneDetails} />

      <nav aria-label={t("tabsLabel")} className="flex gap-3">
        {QUEUES.map((key) => (
          <Link
            key={key}
            href={`/ho/${key}`}
            aria-current={key === queue ? "page" : undefined}
            className={`flex h-12.5 items-center rounded-lg border-2 px-5.5 text-[17px] font-bold ${
              key === queue ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
            }`}
          >
            {t(`tabs.${key}`, { count: counts[key] })}
          </Link>
        ))}
      </nav>

      <div className="flex items-start gap-6">
        <section aria-labelledby="queue-title" className="flex w-[400px] shrink-0 flex-col gap-2.5">
          <h2 id="queue-title" className="sr-only">
            {t(`listLabel.${queue}`)}
          </h2>
          {list.rows.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">{t(`empty.${queue}`)}</p>
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
                        {t("rowOffice", { number: row.caseNumber ?? tc("noNumber"), office: row.officeName })}
                      </span>
                      {row.waitingSince && (
                        <span className="text-sm text-[#3F4843]">
                          {t(`waiting.${queue}`, {
                            date: formatDate(row.waitingSince),
                            days: daysBetween(row.waitingSince, now),
                          })}
                        </span>
                      )}
                      {row.duplicate && (
                        <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#8A4A06]">
                          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                          {t("duplicateFlag")}
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
                  {t("subtitle", {
                    number: details.caseNumber ?? tc("noNumber"),
                    office: details.officeName,
                    district: details.districtName,
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

            <section aria-labelledby="check-documents-title" className="flex flex-col gap-2">
              <h3 id="check-documents-title" className="text-lg font-bold">
                {t("documents")}{" "}
                <span className="text-[15px] font-normal text-muted-foreground">{t("opensInNewTab")}</span>
              </h3>
              <DocumentLinks documents={details.documents} empty={t("noDocuments")} />
            </section>

            {queue === "check" ? (
              <DecisionPanel
                key={`${details.id}-${details.version}`}
                caseId={details.id}
                version={details.version}
                from="queue"
                caseLabel={{
                  name: caseName(tc, details.name, details.childName),
                  number: details.caseNumber ?? tc("noNumber"),
                }}
                action={decideAction}
              />
            ) : (
              <section aria-labelledby="release-title" className="flex flex-col gap-3 border-t pt-4">
                <h3 id="release-title" className="text-lg font-bold">
                  {t("release.title")}
                </h3>
                <ReleaseForm
                  key={`${details.id}-${details.version}`}
                  caseId={details.id}
                  version={details.version}
                  from="queue"
                  limits={{
                    earliest: details.verifiedAt && colomboDay(details.verifiedAt),
                    today: colomboDay(now),
                  }}
                  initial={{ releasedOn: colomboDay(now), referenceNumber: "", note: "" }}
                  mode="record"
                  action={releaseAction}
                />
              </section>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
