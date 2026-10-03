import { getTranslations } from "next-intl/server";
import type { InstallmentStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import type { InstallmentDetails, ReleaseDetails } from "@/server/cases/queries";

/** Installment status colours from the prototype; each pair meets WCAG AA contrast (UI-6). */
const DOT: Record<InstallmentStatus, string> = {
  NOT_STARTED: "border-[#B9B4A8] bg-card text-[#4F5752]",
  PROCESSING: "border-[#C07A12] bg-[#FFF4E0] text-[#8A4A06]",
  RELEASED: "border-primary bg-primary text-primary-foreground",
};
const STATUS_TEXT: Record<InstallmentStatus, string> = {
  NOT_STARTED: "text-[#4F5752]",
  PROCESSING: "text-[#8A4A06]",
  RELEASED: "text-primary",
};

/**
 * "මූල්‍ය ප්‍රගතිය" as in the prototype: the Rs. 2,000,000 released to the DS office, what has been paid
 * to the beneficiary, what the office still holds, and the four installments (REL-3, INS-1).
 * `correction` is Head Office's button to correct the release (REL-4).
 */
export async function MoneySection({
  release,
  installments,
  correction,
}: {
  release: ReleaseDetails;
  installments: InstallmentDetails[];
  correction?: React.ReactNode;
}) {
  const t = await getTranslations("cases");
  const paid = installments.filter((i) => i.status === "RELEASED");
  const paidAmount = paid.reduce((sum, i) => sum + i.amount, 0);
  const tiles = [
    {
      label: t("money.released"),
      amount: release.amount,
      detail: t("money.releasedDetail", {
        date: formatDate(release.releasedOn),
        reference: release.referenceNumber,
      }),
    },
    { label: t("money.paid"), amount: paidAmount, detail: t("money.count", { count: paid.length }) },
    {
      label: t("money.left"),
      amount: release.amount - paidAmount,
      detail: t("money.count", { count: installments.length - paid.length }),
    },
  ];

  return (
    <section aria-labelledby="money-title" className="flex flex-col gap-4 rounded-xl border bg-card px-6 py-5">
      <h2 id="money-title" className="text-xl font-bold">
        {t("money.title")}
      </h2>
      <dl className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5 rounded-lg bg-background px-4 py-3">
            <dt className="text-[15px] text-muted-foreground">{tile.label}</dt>
            <dd className="text-[22px] font-bold">{formatRupees(tile.amount)}</dd>
            <dd className="text-sm text-[#3F4843]">{tile.detail}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full border-collapse text-left">
        <thead className="text-[15px] text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-semibold">
              {t("money.installment")}
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              {t("money.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {installments.map((item) => (
            <tr key={item.number} className="border-b last:border-b-0">
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-bold ${DOT[item.status]}`}
                  >
                    {item.number}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(`installment.name.${item.number as 1 | 2 | 3 | 4}`)}</span>
                    <span className="text-sm text-muted-foreground">
                      {item.purpose
                        ? t("money.amountPurpose", { amount: formatRupees(item.amount), purpose: item.purpose })
                        : formatRupees(item.amount)}
                    </span>
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <span className={`flex flex-col ${STATUS_TEXT[item.status]}`}>
                  <span className="font-semibold">{t(`installment.status.${item.status}`)}</span>
                  {item.releasedOn ? (
                    <span className="text-sm">{t("money.paidOn", { date: formatDate(item.releasedOn) })}</span>
                  ) : (
                    item.expectedOn && (
                      <span className="text-sm">{t("money.expectedOn", { date: formatDate(item.expectedOn) })}</span>
                    )
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[15px] text-[#3F4843]">
        <div className="flex flex-col gap-0.5">
          {release.note && <p className="whitespace-pre-line">{t("money.note", { note: release.note })}</p>}
          <p>{t("money.recordedBy", { name: release.byName, date: formatDate(release.at) })}</p>
        </div>
        {correction}
      </div>
    </section>
  );
}
