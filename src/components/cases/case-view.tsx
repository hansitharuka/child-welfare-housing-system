import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import type { CaseDetails } from "@/server/cases/queries";
import { StatusChip } from "./status-chip";

/**
 * The case's details and documents, read-only, for the DS and Head Office case pages. Phase 5 adds
 * Head Office's decisions and Phase 6 the installments, stages and history (UI-7).
 */
export async function CaseView({ details, editHref }: { details: CaseDetails; editHref: string | null }) {
  const t = await getTranslations("cases");
  const atRisk = details.category === "CHILD_AT_RISK";
  const none = t("none");

  const rows: { label: string; value: string }[] = [
    { label: t("page.fields.number"), value: details.caseNumber ?? t("noNumber") },
    { label: t("page.fields.category"), value: details.category ? t(`category.${details.category}`) : none },
    { label: t("page.fields.kind"), value: details.kind ? t(`kind.${details.kind}`) : none },
    ...(atRisk ? [{ label: t("page.fields.childName"), value: details.childName ?? none }] : []),
    { label: atRisk ? t("page.fields.guardianName") : t("page.fields.name"), value: details.name ?? none },
    { label: t("page.fields.nic"), value: details.nic ?? none },
    { label: t("page.fields.address"), value: details.address ?? none },
    { label: t("page.fields.mobile1"), value: details.mobile1 ?? none },
    { label: t("page.fields.mobile2"), value: details.mobile2 ?? none },
    { label: t("page.fields.remark"), value: details.remark ?? none },
    { label: t("page.fields.office"), value: details.officeName },
    { label: t("page.fields.district"), value: details.districtName },
    ...(details.submittedAt ? [{ label: t("page.fields.submittedAt"), value: formatDate(details.submittedAt) }] : []),
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {details.returnReason !== null && (
        <section
          aria-labelledby="returned-title"
          className="flex flex-col gap-1.5 rounded-xl border-2 border-[#E8B45A] bg-[#FFF4E0] px-6 py-4 text-[#6B3A04]"
        >
          <h2 id="returned-title" className="text-lg font-bold">
            {t("form.returned.title")}
          </h2>
          <p className="text-[17px] font-semibold whitespace-pre-line">{details.returnReason}</p>
        </section>
      )}
      {details.status === "SUBMITTED" && (
        <p className="rounded-lg bg-[#E4EDF8] px-4 py-3 text-[15px] text-[#1E4E8C]">{t("page.waiting")}</p>
      )}

      <section aria-labelledby="details-title" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 id="details-title" className="text-xl font-bold">
            {t("page.details")}
          </h2>
          <StatusChip status={details.status} />
        </div>
        <dl className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[260px_minmax(0,1fr)] gap-4 border-b px-6 py-2.5 last:border-b-0"
            >
              <dt className="text-[15px] text-muted-foreground">{row.label}</dt>
              <dd className="font-semibold break-words whitespace-pre-line">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="documents-title" className="flex flex-col gap-3 rounded-xl border bg-card px-6 py-4">
        <h2 id="documents-title" className="text-xl font-bold">
          {t("page.documents")}
        </h2>
        {details.documents.length === 0 ? (
          <p className="text-muted-foreground">{t("page.noDocuments")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {details.documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/files/${doc.id}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-primary underline"
                >
                  {doc.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editHref && (
        <Link
          href={editHref}
          className="flex h-12 items-center self-start rounded-lg bg-primary px-6 text-[17px] font-semibold text-primary-foreground"
        >
          {details.status === "RETURNED" ? t("page.fix") : t("page.edit")}
        </Link>
      )}
    </div>
  );
}
