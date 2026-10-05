import { getTranslations } from "next-intl/server";
import type { SheetNotes } from "@/server/import/commands";

const NUMBERS = [1, 2, 3, 4] as const;

/**
 * IMP-5: what the old sheet said about a case brought in from it, read-only and grouped as on the
 * sheet: its four installment columns, its four building levels, then its remark and any NIC or phone
 * cell that couldn't be stored. Empty columns are left out.
 */
export async function SheetNotesSection({ notes }: { notes: SheetNotes }) {
  const t = await getTranslations("cases");
  const groups = [
    {
      key: "financial",
      rows: NUMBERS.map((n) => ({ label: t(`installment.name.${n}`), note: notes.installments[n - 1] })),
    },
    { key: "physical", rows: NUMBERS.map((n) => ({ label: t(`sheet.level.${n}`), note: notes.levels[n - 1] })) },
    {
      key: "other",
      rows: [
        { label: t("sheet.remark"), note: notes.remark },
        { label: t("sheet.nic"), note: notes.nic },
        { label: t("sheet.phone"), note: notes.phone },
      ],
    },
  ] as const;

  return (
    <section aria-labelledby="sheet-title" className="flex flex-col gap-3 rounded-xl border bg-card px-5.5 py-5">
      <div className="flex flex-col gap-0.5">
        <h2 id="sheet-title" className="text-xl font-bold">
          {t("sheet.title")}
        </h2>
        <p className="text-[15px] text-muted-foreground">{t("sheet.text")}</p>
      </div>
      {groups.map((group) => {
        const rows = group.rows.filter((row) => row.note);
        if (rows.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-2 border-t pt-3">
            <h3 className="text-base font-bold">{t(`sheet.${group.key}`)}</h3>
            <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
              {rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-[15px] text-muted-foreground">{row.label}</dt>
                  <dd className="break-words whitespace-pre-line">{row.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}
