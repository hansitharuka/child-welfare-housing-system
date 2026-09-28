import { Kind, type PrismaClient } from "../src/generated/prisma/client";
import places from "../data/places.json";
import stages from "../data/stages.json";

/**
 * Adds the provinces, districts, DS offices and building stages that are missing (LST-1, LST-4).
 * Rows that already exist are left alone, so re-running never undoes an admin's change.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  for (const p of places.provinces) {
    await prisma.province.upsert({ where: { nameEn: p.nameEn }, update: {}, create: p });
  }
  const provinceIds = new Map((await prisma.province.findMany()).map((p) => [p.nameEn, p.id]));

  for (const d of places.districts) {
    const provinceId = provinceIds.get(d.province);
    if (provinceId === undefined) throw new Error(`Unknown province "${d.province}" for district ${d.nameEn}`);
    await prisma.district.upsert({
      where: { nameEn: d.nameEn },
      update: {},
      create: { nameEn: d.nameEn, nameSi: d.nameSi, provinceId },
    });
  }
  const districtIds = new Map((await prisma.district.findMany()).map((d) => [d.nameEn, d.id]));

  for (const o of places.dsOffices) {
    const districtId = districtIds.get(o.district);
    if (districtId === undefined) throw new Error(`Unknown district "${o.district}" for DS office ${o.code}`);
    await prisma.dsOffice.upsert({
      where: { code: o.code },
      update: {},
      create: { code: o.code, nameEn: o.nameEn, nameSi: o.nameSi, districtId },
    });
  }

  const stageLists: Record<Kind, string[]> = stages;
  for (const kind of Object.values(Kind)) {
    for (const [index, nameSi] of stageLists[kind].entries()) {
      await prisma.stageDefinition.upsert({
        where: { kind_nameSi: { kind, nameSi } },
        update: {},
        create: { kind, nameSi, sortOrder: index + 1 },
      });
    }
  }
}
