import ExcelJS from "exceljs";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import messages from "../../../messages/si.json";
import { seed } from "../../../prisma/seed-data";
import { addLoadData, removeLoadData } from "../../../scripts/seed-load";
import { createTestClient } from "../../../tests/db/client";
import { dateToDay } from "@/lib/dates";
import { caseWhere } from "../cases/queries";
import type { Viewer } from "../permissions";
import type { ListFilter } from "./case-list";
import { exportSheetLayout, progressStages, sheetRows } from "./sheet-layout";

const db = createTestClient();
const t = createTranslator({ locale: "si", messages, namespace: "cases" });
const LOAD = 5_000;

/** The audit log has no foreign key to the account, so a made-up actor is enough. */
const ho = { role: "HO_OFFICER", dsOfficeId: null, userId: "sheet-test-ho" } as const satisfies Viewer & {
  userId: string;
};

let district: number;

beforeAll(async () => {
  await seed(db);
  await addLoadData(db, { count: LOAD, seed: 12 });
  const [top] = await db.case.groupBy({
    by: ["dsOfficeId"],
    _count: { _all: true },
    orderBy: { _count: { dsOfficeId: "desc" } },
    take: 1,
  });
  district = (await db.dsOffice.findUniqueOrThrow({ where: { id: top.dsOfficeId }, select: { districtId: true } }))
    .districtId;
}, 300_000);

afterAll(async () => {
  await removeLoadData(db);
  await db.$disconnect();
}, 300_000);

/** How many cases of the list are not drafts, counted straight from the database. */
const notDrafts = (filter: ListFilter) =>
  db.case.count({ where: { AND: [caseWhere(ho, filter)!, { status: { not: "DRAFT" } }] } });

describe("Head Office's list in the old sheet's layout (EXP-2, EXP-3)", () => {
  it("holds every case of the list but drafts, district by district and office by office", async () => {
    const filters: ListFilter[] = [{}, { districtId: district }, { statuses: ["IN_PROGRESS"] }, { q: "HMG" }];
    for (const filter of filters) {
      const { rows } = (await sheetRows(db, ho, filter))!;
      expect(rows.length, JSON.stringify(filter)).toBe(await notDrafts(filter));
    }
    expect((await sheetRows(db, ho, { statuses: ["DRAFT"] }))!.rows).toEqual([]);

    // The offices in the database's own order of English names, so its collation decides, not ours.
    const offices = await db.dsOffice.findMany({
      orderBy: [{ district: { nameEn: "asc" } }, { nameEn: "asc" }],
      select: { nameSi: true, district: { select: { nameSi: true } } },
    });
    const place = new Map(offices.map((o, index) => [`${o.district.nameSi}|${o.nameSi}`, index]));
    const { rows } = (await sheetRows(db, ho, {}))!;
    const places = rows.map((r) => place.get(`${r.districtName}|${r.officeName}`)!);
    for (let i = 1; i < rows.length; i++) {
      expect(places[i - 1], `row ${i}`).toBeLessThanOrEqual(places[i]);
      // Within an office the numbers share their prefix, so plain comparison is enough.
      if (places[i - 1] === places[i]) expect(rows[i - 1].caseNumber! < rows[i].caseNumber!, `row ${i}`).toBe(true);
    }
    expect(new Set(places).size).toBeGreaterThan(1);
  });

  it("gives each case its installments and the day its stages were reached, from the database", async () => {
    const { rows, progressHeaders } = (await sheetRows(db, ho, { districtId: district }))!;
    const stages = await db.stageDefinition.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, kind: true, nameSi: true },
    });
    expect(progressHeaders).toEqual(
      progressStages(stages.filter((s) => s.kind === "NEW_HOUSE")).map((s) => s?.nameSi ?? null),
    );

    const cases = await db.case.findMany({
      where: { dsOffice: { districtId: district }, status: { not: "DRAFT" } },
      select: {
        caseNumber: true,
        kind: true,
        status: true,
        installments: { orderBy: { number: "asc" }, select: { status: true, releasedOn: true } },
        stageUpdates: { where: { stageId: { not: null } }, select: { stageId: true, visitedOn: true } },
      },
    });
    const byNumber = new Map(cases.map((c) => [c.caseNumber, c]));
    let reachedAll = 0;
    for (const row of rows) {
      const found = byNumber.get(row.caseNumber)!;
      expect(row.installments.map((i) => [i.status, i.releasedOn])).toEqual(
        found.installments.map((i) => [i.status, i.releasedOn && dateToDay(i.releasedOn)]),
      );
      const columns = progressStages(stages.filter((s) => s.kind === found.kind));
      const days = new Map(found.stageUpdates.map((u) => [u.stageId, dateToDay(u.visitedOn)]));
      expect(row.progress).toEqual(columns.map((s) => (s && days.get(s.id)) ?? null));
      // A completed case reached its kind's last stage (CLS-1), so its "completed" column has a day.
      if (found.status === "COMPLETED" && columns[3]) {
        expect(row.progress[3]).not.toBeNull();
        reachedAll++;
      }
    }
    expect(rows.some((r) => r.installments.length === 4)).toBe(true);
    expect(rows.some((r) => r.progress.some(Boolean))).toBe(true);
    expect(reachedAll).toBeGreaterThan(0);
  });

  it("gives an admin nothing, and logs nothing for them (PRM-2)", async () => {
    const admin = { role: "ADMIN", dsOfficeId: null, userId: "sheet-test-admin" } as const;
    expect(await exportSheetLayout(db, admin, {}, t)).toBeNull();
    expect(await db.auditLog.count({ where: { actorId: admin.userId } })).toBe(0);
  });

  it("EXP-3: logs who exported it, with the filters used and the number of rows", async () => {
    const filter: ListFilter = { districtId: district, category: "CHILD_AT_RISK" };
    const file = (await exportSheetLayout(db, ho, filter, t))!;
    const audit = await db.auditLog.findFirst({
      where: { actorId: ho.userId, action: "cases_exported" },
      orderBy: { id: "desc" },
    });
    expect(audit).toMatchObject({ entityType: "case_list", entityId: "ho_sheet", caseId: null });
    expect(audit?.after).toEqual({ filters: { districtId: district, category: "CHILD_AT_RISK" }, rows: file.rows });
    expect(file.rows).toBe(await notDrafts(filter));
  });

  it("PRF-4, AC-18: every case in under 60 seconds, and the file opens again with two Sinhala tabs, one row per case", async () => {
    const started = performance.now();
    const file = (await exportSheetLayout(db, ho, {}, t))!;
    expect((performance.now() - started) / 1000).toBeLessThan(60);
    expect(file.rows).toBe(await notDrafts({}));
    expect(file.fileName).toMatch(/^දිවියට සවියක් පැරණි ආකෘතිය \d{4}-\d{2}-\d{2}\.xlsx$/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.bytes.buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["නිවාසගත", "අවදානම් දරුවන්"]);
    const [careLeavers, atRisk] = workbook.worksheets;
    expect(careLeavers.getRow(1).getCell(2).value).toBe("නම");
    expect(atRisk.getRow(1).getCell(2).value).toBe("දරුවාගේ නම");
    expect(careLeavers.getRow(2).getCell(8).value).toBe("පළමු වාරිකය");

    const count = (category: "CARE_LEAVER" | "CHILD_AT_RISK") => notDrafts({ category });
    expect(careLeavers.rowCount).toBe((await count("CARE_LEAVER")) + 2);
    expect(atRisk.rowCount).toBe((await count("CHILD_AT_RISK")) + 2);
  }, 120_000);
});
