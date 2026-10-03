import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import type { CaseDetails } from "@/server/cases/queries";
import { StatusChip } from "./status-chip";

type CasesT = Awaited<ReturnType<typeof getTranslations<"cases">>>;

/** Every field of a case as label and value, for the case page and Head Office's check view (CHK-2). */
export function caseFieldRows(t: CasesT, details: CaseDetails): { label: string; value: string }[] {
  const atRisk = details.category === "CHILD_AT_RISK";
  const none = t("none");
  return [
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
    ...(details.verifiedAt ? [{ label: t("page.fields.verifiedAt"), value: formatDate(details.verifiedAt) }] : []),
  ];
}

/** A Head Office reason the DS office must read: why the case came back, or why it was rejected. */
function ReasonBox({ id, title, reason, tone }: { id: string; title: string; reason: string; tone: "warn" | "stop" }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-1.5 rounded-xl border-2 px-6 py-4 ${
        tone === "warn"
          ? "border-[#E8B45A] bg-[#FFF4E0] text-[#6B3A04]"
          : "border-[#E4A39B] bg-[#FDF0EE] text-[#8F1B12]"
      }`}
    >
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <p className="text-[17px] font-semibold whitespace-pre-line">{reason}</p>
    </section>
  );
}

/**
 * The case's details and documents, read-only, for the DS and Head Office case pages. `children`
 * comes after the documents: Head Office's decision or release form (Phase 5). Phase 6 adds the
 * stages and history (UI-7).
 */
export async function CaseView({
  details,
  audience,
  editHref,
  children,
}: {
  details: CaseDetails;
  /** Who reads the page: the notes about waiting are for the DS office. */
  audience: "ds" | "ho";
  editHref: string | null;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("cases");
  const rows = caseFieldRows(t, details);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {details.returnReason !== null && (
        <ReasonBox id="returned-title" title={t("form.returned.title")} reason={details.returnReason} tone="warn" />
      )}
      {details.rejectReason !== null && (
        <ReasonBox id="rejected-title" title={t("page.rejectedTitle")} reason={details.rejectReason} tone="stop" />
      )}
      {audience === "ds" && (details.status === "SUBMITTED" || details.status === "VERIFIED") && (
        <p className="rounded-lg bg-[#E4EDF8] px-4 py-3 text-[15px] text-[#1E4E8C]">
          {details.status === "SUBMITTED" ? t("page.waiting") : t("page.verifiedDs")}
        </p>
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
        <DocumentLinks documents={details.documents} empty={t("page.noDocuments")} />
      </section>

      {children}

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

/** A case's documents, each opening in a new tab (CHK-2). */
export function DocumentLinks({ documents, empty }: { documents: CaseDetails["documents"]; empty: string }) {
  if (documents.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {documents.map((doc) => (
        <li key={doc.id}>
          <a href={`/files/${doc.id}`} target="_blank" rel="noopener" className="font-semibold text-primary underline">
            {doc.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
