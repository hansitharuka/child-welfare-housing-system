import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CaseView } from "@/components/cases/case-view";
import { caseName, PageHeader } from "@/components/cases/page-header";
import { getCase } from "@/server/cases/queries";
import { canEditDetails } from "@/server/cases/rules";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";

/** Head Office's case page (UI-7). Phase 5 adds the check and the release here. */
export default async function HoCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const viewer = await requireRole("HO_OFFICER");
  const { id } = await params;
  const details = await getCase(db, viewer, id);
  if (!details) notFound();

  const t = await getTranslations("cases");
  const justSubmitted = (await searchParams).notice === "submitted" && details.caseNumber !== null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backHref="/ho/cases"
        backLabel={t("back.ho")}
        title={caseName(t, details.name, details.childName)}
        subtitle={`${details.caseNumber ?? t("noNumber")} · ${details.officeName}`}
      />
      {justSubmitted && (
        <section
          aria-labelledby="submitted-title"
          className="flex max-w-4xl flex-col gap-2 rounded-xl border-2 border-primary bg-accent px-6 py-5"
        >
          <h2 id="submitted-title" className="text-[22px] font-bold text-primary">
            {t("submitted.title")}
          </h2>
          <p className="text-lg">
            {t("submitted.number")} <strong data-testid="case-number">{details.caseNumber}</strong>
          </p>
          <p className="text-[#3F4843]">{t("submitted.textHo")}</p>
        </section>
      )}
      <CaseView
        details={details}
        editHref={canEditDetails(viewer.role, details.status) ? `/ho/cases/${details.id}/edit` : null}
      />
    </div>
  );
}
