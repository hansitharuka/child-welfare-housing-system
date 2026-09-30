import { afterAll, describe, expect, it } from "vitest";
import places from "../data/places.json";
import { createTestClient } from "../tests/db/client";
import { seed } from "./seed-data";

const prisma = createTestClient();

afterAll(() => prisma.$disconnect());

async function counts() {
  const [provinces, districts, offices, stages] = await Promise.all([
    prisma.province.count(),
    prisma.district.count(),
    prisma.dsOffice.count(),
    prisma.stageDefinition.count(),
  ]);
  return { provinces, districts, offices, stages };
}

describe("seed (LST-1, LST-4)", () => {
  it("creates the provinces, districts, DS offices and new-house stages", async () => {
    await seed(prisma);

    // Other database test files share this schema and may add offices and stages of their own,
    // so count only the rows that come from the data files.
    expect(await counts()).toMatchObject({ provinces: 9, districts: 25 });
    const seededOffices = await prisma.dsOffice.count({ where: { code: { in: places.dsOffices.map((o) => o.code) } } });
    expect(seededOffices).toBe(places.dsOffices.length);
    const homagama = await prisma.dsOffice.findUniqueOrThrow({ where: { code: "HMG" }, include: { district: true } });
    expect(homagama.district.nameEn).toBe("Colombo");
    const stages = await prisma.stageDefinition.findMany({
      where: { kind: "NEW_HOUSE" },
      orderBy: { sortOrder: "asc" },
    });
    expect(stages.map((s) => s.nameSi)).toEqual(["අත්තිවාරම් මට්ටම", "බිත්ති මට්ටම", "වහල මට්ටම", "නිමයි"]);
  });

  it("runs again without adding rows or undoing an admin's change", async () => {
    const before = await counts();
    await prisma.dsOffice.update({ where: { code: "HMG" }, data: { active: false } });
    try {
      await seed(prisma);

      expect(await counts()).toEqual(before);
      expect((await prisma.dsOffice.findUniqueOrThrow({ where: { code: "HMG" } })).active).toBe(false);
    } finally {
      // Other test files create officers at Homagama.
      await prisma.dsOffice.update({ where: { code: "HMG" }, data: { active: true } });
    }
  });
});
