import type { PrismaClient } from "@/generated/prisma/client";
import type { Kind } from "@/generated/prisma/enums";

export type DistrictSummary = { id: number; name: string; province: string; offices: number };

export async function listDistricts(db: PrismaClient): Promise<DistrictSummary[]> {
  const districts = await db.district.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nameSi: true, province: { select: { nameSi: true } }, _count: { select: { dsOffices: true } } },
  });
  return districts.map((d) => ({ id: d.id, name: d.nameSi, province: d.province.nameSi, offices: d._count.dsOffices }));
}

export type OfficeRow = {
  id: number;
  nameSi: string;
  nameEn: string;
  code: string;
  active: boolean;
  /** The office's Child Rights Promotion Officer (its one active DS officer); empty if it still needs one. */
  officer: string | null;
};

export async function officesOfDistrict(
  db: PrismaClient,
  districtId: number,
): Promise<{ district: DistrictSummary; offices: OfficeRow[] } | null> {
  const district = await db.district.findUnique({
    where: { id: districtId },
    select: {
      id: true,
      nameSi: true,
      province: { select: { nameSi: true } },
      dsOffices: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          nameSi: true,
          nameEn: true,
          code: true,
          active: true,
          users: { where: { role: "DS_OFFICER", banned: false }, select: { name: true }, take: 1 },
        },
      },
    },
  });
  if (!district) return null;
  return {
    district: {
      id: district.id,
      name: district.nameSi,
      province: district.province.nameSi,
      offices: district.dsOffices.length,
    },
    offices: district.dsOffices.map((o) => ({
      id: o.id,
      nameSi: o.nameSi,
      nameEn: o.nameEn,
      code: o.code,
      active: o.active,
      officer: o.users[0]?.name ?? null,
    })),
  };
}

export type StageRow = { id: number; nameSi: string; sortOrder: number; active: boolean };

export async function stagesByKind(db: PrismaClient): Promise<Record<Kind, StageRow[]>> {
  const stages = await db.stageDefinition.findMany({
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    select: { id: true, kind: true, nameSi: true, sortOrder: true, active: true },
  });
  const byKind: Record<Kind, StageRow[]> = { NEW_HOUSE: [], RENOVATION: [] };
  for (const { kind, ...stage } of stages) byKind[kind].push(stage);
  return byKind;
}

export type OfficeOption = { id: number; name: string; active: boolean };
export type DistrictOptions = { id: number; name: string; offices: OfficeOption[] };

/** Every district with its DS offices, for choosing a case's office (CASE-3) or filtering a list (FND-1). */
export async function districtsWithOffices(db: PrismaClient): Promise<DistrictOptions[]> {
  const districts = await db.district.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      nameSi: true,
      dsOffices: { orderBy: { id: "asc" }, select: { id: true, nameSi: true, active: true } },
    },
  });
  return districts.map((d) => ({
    id: d.id,
    name: d.nameSi,
    offices: d.dsOffices.map((o) => ({ id: o.id, name: o.nameSi, active: o.active })),
  }));
}
