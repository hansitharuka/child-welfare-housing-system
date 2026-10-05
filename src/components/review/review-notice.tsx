import { getTranslations } from "next-intl/server";
import { caseName } from "@/components/cases/page-header";
import { FormNotice } from "@/components/forms/form-field";
import type { CaseDetails } from "@/server/cases/queries";

/**
 * What a check, release or confirmation leaves on the next page, by its key under "review.notices".
 * A confirmation of a case from the old sheet (IMP-5) names the status it was given.
 */
const NOTICES = ["verified", "sentBack", "rejected", "released", "corrected", "confirmed"] as const;
type ReviewNoticeKey = (typeof NOTICES)[number];

export const isReviewNotice = (value: unknown): value is ReviewNoticeKey =>
  typeof value === "string" && (NOTICES as readonly string[]).includes(value);

/** Says what was just done to the case, by its name and number. The URL holds only the case's id (SEC-8). */
export async function ReviewNotice({ notice, details }: { notice: unknown; details: CaseDetails | null }) {
  if (!isReviewNotice(notice) || !details) return null;
  const [t, tc] = await Promise.all([getTranslations("review"), getTranslations("cases")]);
  return (
    <FormNotice
      message={t(`notices.${notice}`, {
        name: caseName(tc, details.name, details.childName),
        number: details.caseNumber ?? tc("noNumber"),
        office: details.officeName,
        status: tc(`status.${details.status}`),
      })}
    />
  );
}
