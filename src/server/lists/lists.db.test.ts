import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../../prisma/seed-data";
import { createTestClient, freeOfficeId } from "../../../tests/db/client";
import { addOffice, addStage, moveStage, renameOffice, renameStage, setOfficeActive, setStageActive } from "./commands";
import { officesOfDistrict, stagesByKind } from "./queries";

const db = createTestClient();
const ADMIN = "lists-test-admin";
let colombo: number;

beforeAll(async () => {
  await seed(db);
  colombo = (await db.district.findUniqueOrThrow({ where: { nameEn: "Colombo" } })).id;
});

afterAll(() => db.$disconnect());

const audits = (entityType: string) => db.auditLog.findMany({ where: { entityType }, orderBy: { id: "asc" } });

describe("DS offices (LST-2, LST-3)", () => {
  it("adds an office to a district, with an audit record", async () => {
    expect(
      await addOffice(db, ADMIN, colombo, { nameSi: "පරීක්ෂණ කාර්යාලය", nameEn: "Test Office", code: "KOL" }),
    ).toEqual({
      ok: true,
    });
    const listed = await officesOfDistrict(db, colombo);
    expect(listed?.offices.map((o) => o.code)).toContain("KOL");
    expect((await audits("ds_office")).at(-1)?.action).toBe("office_added");
  });

  it("refuses a code used anywhere, or a name used in the same district", async () => {
    expect(await addOffice(db, ADMIN, colombo, { nameSi: "නව කාර්යාලය", nameEn: "New Office", code: "HMG" })).toEqual({
      ok: false,
      error: "codeTaken",
    });
    expect(await addOffice(db, ADMIN, colombo, { nameSi: "හෝමාගම", nameEn: "Homagama Two", code: "HMX" })).toEqual({
      ok: false,
      error: "nameTaken",
    });
  });

  it("renames and deactivates an office without deleting it", async () => {
    const kol = await db.dsOffice.findUniqueOrThrow({ where: { code: "KOL" } });
    expect(await renameOffice(db, ADMIN, kol.id, { nameSi: "පරීක්ෂණ කාර්යාලය නව", nameEn: "Test Office New" })).toEqual(
      {
        ok: true,
      },
    );
    expect(await setOfficeActive(db, ADMIN, kol.id, false)).toEqual({ ok: true });

    const after = await db.dsOffice.findUniqueOrThrow({ where: { code: "KOL" } });
    expect(after).toMatchObject({ nameSi: "පරීක්ෂණ කාර්යාලය නව", code: "KOL", active: false });
  });

  it("names each office's Child Rights Promotion Officer (ADM-3)", async () => {
    const office = await db.dsOffice.findUniqueOrThrow({ where: { id: await freeOfficeId(db) } });
    const before = await officesOfDistrict(db, office.districtId);
    expect(before?.offices.find((o) => o.id === office.id)?.officer).toBeNull();

    await db.user.create({
      data: {
        id: "lists-officer",
        name: "කේ. නිලධාරී",
        email: "lists-officer@no-email.invalid",
        username: "ds9300",
        role: "DS_OFFICER",
        dsOfficeId: office.id,
      },
    });
    const after = await officesOfDistrict(db, office.districtId);
    expect(after?.offices.find((o) => o.id === office.id)?.officer).toBe("කේ. නිලධාරී");
  });
});

describe("building stages (LST-4)", () => {
  it("adds renovation stages in order and moves one up", async () => {
    expect(await addStage(db, ADMIN, "RENOVATION", "වහලය අලුත්වැඩියාව")).toEqual({ ok: true });
    expect(await addStage(db, ADMIN, "RENOVATION", "බිත්ති අලුත්වැඩියාව")).toEqual({ ok: true });
    expect(await addStage(db, ADMIN, "RENOVATION", "වහලය අලුත්වැඩියාව")).toEqual({ ok: false, error: "nameTaken" });

    const second = (await stagesByKind(db)).RENOVATION[1];
    expect(await moveStage(db, ADMIN, second.id, "up")).toEqual({ ok: true });
    expect((await stagesByKind(db)).RENOVATION.map((s) => s.nameSi)).toEqual([
      "බිත්ති අලුත්වැඩියාව",
      "වහලය අලුත්වැඩියාව",
    ]);
  });

  it("leaves the first stage where it is when moved up", async () => {
    const first = (await stagesByKind(db)).NEW_HOUSE[0];
    expect(await moveStage(db, ADMIN, first.id, "up")).toEqual({ ok: true });
    expect((await stagesByKind(db)).NEW_HOUSE[0].id).toBe(first.id);
  });

  it("renames and deactivates a stage, keeping the new-house list intact", async () => {
    const [renovation] = (await stagesByKind(db)).RENOVATION;
    expect(await renameStage(db, ADMIN, renovation.id, "බිත්ති සහ ජනේල")).toEqual({ ok: true });
    expect(await setStageActive(db, ADMIN, renovation.id, false)).toEqual({ ok: true });

    const stages = await stagesByKind(db);
    expect(stages.RENOVATION[0]).toMatchObject({ nameSi: "බිත්ති සහ ජනේල", active: false });
    expect(stages.NEW_HOUSE).toHaveLength(4);
    expect((await audits("stage_definition")).map((a) => a.action)).toEqual(
      expect.arrayContaining(["stage_added", "stage_moved", "stage_renamed", "stage_deactivated"]),
    );
  });
});
