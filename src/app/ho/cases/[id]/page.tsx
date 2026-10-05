import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CaseColumns, CaseDetailsSection, CaseNotes, caseSubtitle } from "@/components/cases/case-view";
import { MoneySection } from "@/components/cases/money-section";
import { caseName, PageHeader } from "@/components/cases/page-header";
import { SheetNotesSection } from "@/components/cases/sheet-notes";
import { StatusChip } from "@/components/cases/status-chip";
import { FormNotice } from "@/components/forms/form-field";
import { CompletedBanner, StoppedBanner } from "@/components/progress/case-banners";
import { CaseHistory } from "@/components/progress/case-history";
import { ReasonAction } from "@/components/progress/reason-action";
import { StageSection } from "@/components/progress/stage-section";
import { ConfirmImport } from "@/components/review/confirm-import";
import { CorrectRelease } from "@/components/review/correct-release";
import { DecisionPanel } from "@/components/review/decision-panel";
import { DuplicateCases } from "@/components/review/duplicate-cases";
import { ReleaseForm } from "@/components/review/release-form";
import { ReviewNotice } from "@/components/review/review-notice";
import { colomboDay } from "@/lib/dates";
import { balance, formatRupees } from "@/lib/money";
import { duplicatesInFull } from "@/server/cases/duplicates";
import { getCase, type InstallmentDetails } from "@/server/cases/queries";
import { canEditDetails } from "@/server/cases/rules";
import { statusToReopen } from "@/server/cases/stop";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { caseHistory } from "@/server/history/queries";
import { lastPaid } from "@/server/installments/rules";
import { getStageProgress } from "@/server/stages/queries";
import { correctReleaseAction, decideAction, releaseAction } from "../../check/actions";
import { confirmImportAction } from "../../imported/actions";
import { reopenAction, stopAction, undoInstallmentAction } from "./actions";

/** What a stop, reopen or undo leaves on the page, by its key under "progress.notices". */
const NOTICES = ["stopped", "reopened", "undone"] as const;
const isNotice = (value: unknown): value is (typeof NOTICES)[number] =>
  typeof value === "string" && (NOTICES as readonly string[]).includes(value);

/**
 * Head Office's case page (UI-7). A submitted case can be decided here as in the check view (CHK-2,
 * CHK-3), a verified one released (REL-2), and a recorded release corrected (REL-4). A running case
 * shows its installments, stages with photos (STG-6) and history (HIS-2); Head Office can stop and
 * reopen it (CLS-2, CLS-3) and undo the last payment (INS-6). A case from the old sheet shows the
 * sheet's notes, and is confirmed here as on the imported cases' screen (IMP-5).
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

  const [t, tr, tp, history, progress, subtitle] = await Promise.all([
    getTranslations("cases"),
    getTranslations("review"),
    getTranslations("progress"),
    caseHistory(db, viewer, details.id),
    details.release ? getStageProgress(db, details.id, details.kind) : Promise.resolve(null),
    caseSubtitle(details, "ho"),
  ]);
  const notice = (await searchParams).notice;
  const justSubmitted = notice === "submitted" && details.caseNumber !== null;
  const name = caseName(t, details.name, details.childName);
  const number = details.caseNumber ?? t("noNumber");
  const now = new Date();
  const limits = { earliest: details.verifiedAt && colomboDay(details.verifiedAt), today: colomboDay(now) };
  const duplicates =
    details.status === "SUBMITTED" || details.status === "IMPORTED"
      ? await duplicatesInFull(db, viewer, { caseId: details.id, nic: details.nic, dsOfficeId: details.dsOfficeId })
      : [];
  const hidden = { caseId: details.id, version: String(details.version) };
  const reasonTexts = {
    reasonHelp: tp("stop.reasonHelp"),
    cancel: tp("stop.cancel"),
    working: tp("stop.working"),
  };

  const canStop = details.status === "VERIFIED" || details.status === "IN_PROGRESS";
  const stop = canStop && (
    <ReasonAction
      key={`stop-${details.version}`}
      id="stop"
      look="danger"
      hidden={hidden}
      action={stopAction}
      texts={{
        ...reasonTexts,
        button: tp("stop.button"),
        title: tp("stop.title"),
        text: details.release
          ? tp("stop.text", { name, number, balance: formatRupees(balance(details.release, details.installments)) })
          : tp("stop.textNoRelease", { name, number }),
        reason: tp("stop.reason"),
        confirm: tp("stop.confirm"),
      }}
    />
  );
  const reopen = details.status === "STOPPED" && (
    <ReasonAction
      key={`reopen-${details.version}`}
      id="reopen"
      look="plain"
      hidden={hidden}
      action={reopenAction}
      texts={{
        ...reasonTexts,
        button: tp("stop.reopen"),
        title: tp("stop.reopenTitle"),
        text: tp("stop.reopenText", {
          name,
          number,
          status: t(
            `status.${statusToReopen({ statusBeforeStop: details.stop?.statusBefore ?? null, hasRelease: details.release !== null })}`,
          ),
        }),
        reason: tp("stop.reopenReason"),
        confirm: tp("stop.reopenConfirm"),
      }}
    />
  );

  /** INS-6: only the most recently paid installment of a running case can be moved back. */
  const undoTarget = details.status === "IN_PROGRESS" ? lastPaid(details.installments) : null;
  const undo = (item: InstallmentDetails) => {
    if (item.number !== undoTarget?.number) return null;
    const installment = t(`installment.name.${item.number as 1 | 2 | 3 | 4}`);
    return (
      <ReasonAction
        key={`undo-${details.version}`}
        id="undo"
        look="small"
        hidden={{ ...hidden, number: String(item.number) }}
        action={undoInstallmentAction}
        texts={{
          ...reasonTexts,
          button: tp("installments.undo"),
          title: tp("installments.undoTitle", { installment }),
          text: tp("installments.undoText"),
          reason: tp("installments.undoReason"),
          confirm: tp("installments.undoConfirm"),
        }}
      />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backHref="/ho/cases"
        backLabel={t("back.ho")}
        title={name}
        subtitle={subtitle}
        aside={
          <div className="flex items-center gap-3.5">
            <StatusChip status={details.status} />
            {stop}
          </div>
        }
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
      {isNotice(notice) && <FormNotice message={tp(`notices.${notice}`)} />}
      <ReviewNotice notice={notice} details={details} />
      <CaseNotes details={details} audience="ho" />
      <StoppedBanner details={details} reopen={reopen} />
      <CompletedBanner details={details} />
      <CaseColumns
        main={
          <>
            {duplicates.length > 0 && <DuplicateCases matches={duplicates} />}
            {details.status === "SUBMITTED" && (
              <div className="rounded-xl border bg-card px-6 pb-5 [&>section]:border-t-0">
                <DecisionPanel
                  key={details.version}
                  caseId={details.id}
                  version={details.version}
                  from="case"
                  caseLabel={{ name, number }}
                  action={decideAction}
                />
              </div>
            )}
            {details.status === "IMPORTED" && (
              <div className="rounded-xl border bg-card px-6 pb-5 [&>section]:border-t-0">
                <ConfirmImport
                  key={details.version}
                  caseId={details.id}
                  version={details.version}
                  from="case"
                  caseName={name}
                  kindMissing={details.kind === null}
                  today={limits.today}
                  sheetInstallments={details.sheetNotes?.installments ?? []}
                  action={confirmImportAction}
                />
              </div>
            )}
            {details.status === "VERIFIED" && (
              <section
                aria-labelledby="release-title"
                className="flex flex-col gap-3 rounded-xl border bg-card px-6 py-5"
              >
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
            {details.release && (
              <MoneySection
                release={details.release}
                installments={details.installments}
                actions={undoTarget ? undo : undefined}
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
            )}
            {details.sheetNotes && <SheetNotesSection notes={details.sheetNotes} />}
            <CaseHistory entries={history ?? []} />
          </>
        }
        side={
          <>
            {progress && <StageSection progress={progress} />}
            <CaseDetailsSection
              details={details}
              editHref={canEditDetails(viewer.role, details.status) ? `/ho/cases/${details.id}/edit` : null}
            />
          </>
        }
      />
    </div>
  );
}
