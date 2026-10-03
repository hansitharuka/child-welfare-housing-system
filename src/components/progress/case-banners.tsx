import { CircleCheck, CircleX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import { balance, formatRupees } from "@/lib/money";
import type { CaseDetails } from "@/server/cases/queries";

/**
 * CLS-2, as in the prototype: a stopped case says so at the top, with the day, Head Office's reason
 * and the balance left with the DS office. `reopen` is Head Office's button to reopen it (CLS-3).
 */
export async function StoppedBanner({ details, reopen }: { details: CaseDetails; reopen?: React.ReactNode }) {
  if (!details.stop) return null;
  const t = await getTranslations("progress.stop");
  return (
    <section
      aria-labelledby="stopped-title"
      className="flex items-center gap-4 rounded-xl border-2 border-destructive bg-[#FDF0EE] px-5 py-4 text-[#8F1B12]"
    >
      <CircleX aria-hidden="true" className="size-7 shrink-0" />
      <div className="flex flex-1 flex-col gap-0.5">
        <h2 id="stopped-title" className="text-[17px] font-bold">
          {t("bannerTitle", { date: formatDate(details.stop.at) })}
        </h2>
        {details.stop.reason && (
          <p className="whitespace-pre-line">{t("bannerReason", { reason: details.stop.reason })}</p>
        )}
        {details.release && (
          <p>{t("bannerBalance", { balance: formatRupees(balance(details.release, details.installments)) })}</p>
        )}
      </div>
      {reopen}
    </section>
  );
}

/** A finished case says when it finished (CLS-1). */
export async function CompletedBanner({ details }: { details: CaseDetails }) {
  if (details.status !== "COMPLETED") return null;
  const t = await getTranslations("progress");
  return (
    <p className="flex items-center gap-3 rounded-xl border-2 border-primary bg-accent px-5 py-3.5 font-semibold text-primary">
      <CircleCheck aria-hidden="true" className="size-6 shrink-0" />
      {t("completed", { date: formatDate(details.completedAt ?? details.updatedAt) })}
    </p>
  );
}
