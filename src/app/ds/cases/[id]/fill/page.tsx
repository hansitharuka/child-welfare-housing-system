import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { caseName, PageHeader } from "@/components/cases/page-header";
import { ImportedForm } from "@/components/forms/imported-form";
import { getCase } from "@/server/cases/queries";
import { canFillImported } from "@/server/cases/rules";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { checkNicAction, fillImportedAction } from "../../actions";

/**
 * IMP-5: the DS office fills in the kind of help, NIC and phone numbers of a case brought in from the
 * old sheet. Once Head Office has confirmed it, this goes back to the case page.
 */
export default async function FillImportedPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRole("DS_OFFICER");
  const { id } = await params;
  const details = await getCase(db, viewer, id);
  if (!details) notFound();
  if (!canFillImported(viewer.role, details.status)) redirect(`/ds/cases/${id}`);

  const t = await getTranslations("cases");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backHref={`/ds/cases/${id}`}
        backLabel={t("back.case")}
        title={t("fill.title")}
        subtitle={caseName(t, details.name, details.childName)}
      />
      <ImportedForm
        // A new version after each save starts the form again from what was saved.
        key={details.version}
        caseId={details.id}
        version={details.version}
        atRisk={details.category === "CHILD_AT_RISK"}
        initial={{
          kind: details.kind ?? "",
          nic: details.nic ?? "",
          mobile1: details.mobile1 ?? "",
          mobile2: details.mobile2 ?? "",
        }}
        sheet={{ nic: details.sheetNotes?.nic, phone: details.sheetNotes?.phone }}
        actions={{ save: fillImportedAction, checkNic: checkNicAction }}
      />
    </div>
  );
}
