import { randomUUID } from "node:crypto";
import type ExcelJS from "exceljs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Category } from "@/generated/prisma/enums";
import { placeholderEmail } from "../auth/accounts";
import { writeAudit } from "../audit";
import { loadPlaces, type PlaceProblem, placer } from "./places";
import { readSheet, type RowKeyReason, type SheetRow } from "./sheet";
import { readNic, readPhones } from "./values";

/**
 * Brings the old sheet's rows in as IMPORTED cases (IMP-1 to IMP-5, IMP-7). Rows already imported are
 * passed over, so running it again adds only rows that couldn't come in before, such as those of a DS
 * office added to the list since. Everything is written in one transaction: a run that fails adds nothing.
 */

/** The disabled account that imported cases are created by. It has no username, so it can't sign in. */
export const SHEET_IMPORT_USER_ID = "sheet-import";

/**
 * What the old sheet said about a case, kept read-only on it (IMP-5): the notes in its four
 * installment and four building-level columns, and its remark. When a NIC or phone cell couldn't all
 * be stored, the cell as written is kept too.
 */
export type SheetNotes = {
  installments: (string | null)[];
  levels: (string | null)[];
  remark: string | null;
  nic?: string;
  phone?: string;
};

/** Why a row was not imported (IMP-6). */
export type SkipReason = PlaceProblem | "noName";

/** Why an imported row needs a look (IMP-6). A missing NIC or phone number is not one of them (IMP-4). */
export type AttentionReason = RowKeyReason | "badNic" | "badPhone" | "tooManyPhones" | "noChildName" | "noGuardianName";

/** A row for the report: where it is and why, with no personal details (IMP-6). */
export type ImportIssue<Reason> = {
  category: Category;
  row: number;
  reason: Reason;
  /** For a row that couldn't be placed: its district and DS office as written, to fix the list or the sheet. */
  written?: { district: string | null; office: string | null };
};

export type ImportResult = {
  dryRun: boolean;
  created: Record<Category, number>;
  /** Rows imported by an earlier run (IMP-7). */
  alreadyImported: number;
  emptyRows: number;
  skipped: ImportIssue<SkipReason>[];
  attention: ImportIssue<AttentionReason>[];
};

export type ImportOptions = {
  /** Read and check everything, but write nothing. */
  dryRun?: boolean;
  /** The file's name, for the audit record. */
  file?: string;
  now?: Date;
};

/** The sheet's notes, or null when the row has none. */
function sheetNotes(row: SheetRow, keep: { nic: boolean; phone: boolean }): SheetNotes | null {
  const notes: SheetNotes = { installments: row.installments, levels: row.levels, remark: row.remark };
  if (keep.nic && row.nic) notes.nic = row.nic;
  if (keep.phone && row.phone) notes.phone = row.phone;
  const empty = !notes.remark && !notes.nic && !notes.phone && ![...notes.installments, ...notes.levels].some(Boolean);
  return empty ? null : notes;
}

const withoutEmpty = (fields: Record<string, Prisma.InputJsonValue | null | undefined>): Prisma.InputJsonObject =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));

export async function importSheet(
  db: PrismaClient,
  workbook: ExcelJS.Workbook,
  { dryRun = false, file, now = new Date() }: ImportOptions = {},
): Promise<ImportResult> {
  const { rows, emptyRows } = readSheet(workbook);
  const place = placer(await loadPlaces(db));
  const imported = await db.case.findMany({
    where: { sheetKey: { in: rows.map((row) => row.key) } },
    select: { sheetKey: true },
  });
  const done = new Set(imported.map((c) => c.sheetKey));

  const result: ImportResult = {
    dryRun,
    created: { CARE_LEAVER: 0, CHILD_AT_RISK: 0 },
    alreadyImported: 0,
    emptyRows,
    skipped: [],
    attention: [],
  };
  const cases: Prisma.CaseCreateManyInput[] = [];

  for (const row of rows) {
    if (done.has(row.key)) {
      result.alreadyImported++;
      continue;
    }
    const { category } = row;
    const placed = place(row.district, row.office);
    if ("problem" in placed) {
      const written = { district: row.district, office: row.office };
      result.skipped.push({ category, row: row.row, reason: placed.problem, written });
      continue;
    }
    if (!row.name && !row.childName) {
      result.skipped.push({ category, row: row.row, reason: "noName" });
      continue;
    }

    const nic = readNic(row.nic);
    const phones = readPhones(row.phone);
    const atRisk = category === "CHILD_AT_RISK";
    const reasons: (AttentionReason | null)[] = [
      row.keyedOnRow,
      nic.problem,
      phones.problem,
      atRisk && !row.childName ? "noChildName" : null,
      atRisk && !row.name ? "noGuardianName" : null,
    ];
    for (const reason of reasons) if (reason) result.attention.push({ category, row: row.row, reason });

    const notes = sheetNotes(row, { nic: nic.problem !== null, phone: phones.problem !== null });
    cases.push({
      id: randomUUID(),
      dsOfficeId: placed.officeId,
      category,
      // The sheet doesn't say; the DS office fills it in (IMP-5).
      kind: null,
      status: "IMPORTED",
      name: row.name,
      childName: atRisk ? row.childName : null,
      nic: nic.nic,
      nicKey: nic.nicKey,
      address: row.address,
      mobile1: phones.phones[0] ?? null,
      mobile2: phones.phones[1] ?? null,
      createdById: SHEET_IMPORT_USER_ID,
      createdAt: now,
      sheetKey: row.key,
      sheetRow: row.row,
      sheetSerial: row.serial,
      sheetNotes: notes ?? undefined,
    });
    result.created[category]++;
  }

  if (dryRun || cases.length === 0) return result;

  await db.$transaction(
    async (tx) => {
      await tx.user.upsert({
        where: { id: SHEET_IMPORT_USER_ID },
        update: {},
        create: {
          id: SHEET_IMPORT_USER_ID,
          name: "පැරණි පත්‍රිකාව",
          email: placeholderEmail(SHEET_IMPORT_USER_ID),
          role: "HO_OFFICER",
          banned: true,
          banReason: "imports the old sheet",
        },
      });
      // A second import at the same moment would meet the unique sheet key here and roll back.
      await tx.case.createMany({ data: cases });
      // HIS-1: one record per case, as a created case has. The system did it, so there is no actor.
      await tx.auditLog.createMany({
        data: cases.map((c) => ({
          at: now,
          actorId: null,
          action: "case_imported",
          entityType: "case",
          entityId: c.id!,
          caseId: c.id!,
          after: withoutEmpty({
            dsOfficeId: c.dsOfficeId,
            category: c.category,
            childName: c.childName,
            name: c.name,
            nic: c.nic,
            address: c.address,
            mobile1: c.mobile1,
            mobile2: c.mobile2,
            sheetKey: c.sheetKey,
          }),
        })),
      });
      await writeAudit(tx, {
        actorId: null,
        action: "sheet_imported",
        entityType: "sheet",
        entityId: randomUUID(),
        after: withoutEmpty({
          file,
          created: result.created,
          alreadyImported: result.alreadyImported,
          skipped: result.skipped.length,
        }),
      });
    },
    { timeout: 120_000 },
  );
  return result;
}
