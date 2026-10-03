import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CaseView } from "@/components/cases/case-view";
import { MoneySection } from "@/components/cases/money-section";
import { caseName, PageHeader } from "@/components/cases/page-header";
import { FormNotice } from "@/components/forms/form-field";
import { CorrectRelease } from "@/components/review/correct-release";
import { DecisionPanel } from "@/components/review/decision-panel";
import { DuplicateCases } from "@/components/review/duplicate-cases";
import { ReleaseForm } from "@/components/review/release-form";
import { ReviewNotice } from "@/components/review/review-notice";
import { colomboDay } from "@/lib/dates";
import { duplicatesInFull } from "@/server/cases/duplicates";
import { getCase } from "@/server/cases/queries";
import { canEditDetails } from "@/server/cases/rules";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { correctReleaseAction, decideAction, releaseAction } from "../../check/actions";

/**
 * Head Office's case page (UI-7). A submitted case can be decided here as in the check view (CHK-2,
 * CHK-3), a verified one released (REL-2), and a recorded release corrected (REL-4).
 */
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

  const [t, tr] = await Promise.all([getTranslations("cases"), getTranslations("review")]);
  const notice = (await searchParams).notice;
  const justSubmitted = notice === "submitted" && details.caseNumber !== null;
  const name = caseName(t, details.name, details.childName);
  const now = new Date();
  const limits = { earliest: details.verifiedAt && colomboDay(details.verifiedAt), today: colomboDay(now) };
  const duplicates =
    details.status === "SUBMITTED"
      ? await duplicatesInFull(db, viewer, { caseId: details.id, nic: details.nic, dsOfficeId: details.dsOfficeId })
      : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backHref="/ho/cases"
        backLabel={t("back.ho")}
        title={name}
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
      {notice === "changed" && <FormNotice message={t("notices.changed")} />}
      <ReviewNotice notice={notice} details={details} />
      {duplicates.length > 0 && (
        <div className="max-w-4xl">
          <DuplicateCases matches={duplicates} />
        </div>
      )}
      {details.release && (
        <div className="max-w-4xl">
          <MoneySection
            release={details.release}
            installments={details.installments}
            correction={
              <CorrectRelease
                key={details.version}
                caseId={details.id}
                version={details.version}
                limits={limits}
                current={{
                  releasedOn: details.release.releasedOn,
                  referenceNumber: details.release.referenceNumber,
                  note: details.release.note ?? "",
                }}
                action={correctReleaseAction}
              />
            }
          />
        </div>
      )}
      <CaseView
        details={details}
        audience="ho"
        editHref={canEditDetails(viewer.role, details.status) ? `/ho/cases/${details.id}/edit` : null}
      >
        {details.status === "SUBMITTED" && (
          <div className="rounded-xl border bg-card px-6 pb-5 [&>section]:border-t-0">
            <DecisionPanel
              key={details.version}
              caseId={details.id}
              version={details.version}
              from="case"
              caseLabel={{ name, number: details.caseNumber ?? t("noNumber") }}
              action={decideAction}
            />
          </div>
        )}
        {details.status === "VERIFIED" && (
          <section aria-labelledby="release-title" className="flex flex-col gap-3 rounded-xl border bg-card px-6 py-5">
            <h2 id="release-title" className="text-xl font-bold">
              {tr("release.title")}
            </h2>
            <ReleaseForm
              key={details.version}
              caseId={details.id}
              version={details.version}
              from="case"
              limits={limits}
              initial={{ releasedOn: limits.today, referenceNumber: "", note: "" }}
              mode="record"
              action={releaseAction}
            />
          </section>
        )}
      </CaseView>
    </div>
  );
}
