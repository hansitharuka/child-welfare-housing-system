import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

/** A Prisma client bound to this test run's own schema (see global-setup.ts). */
export function createTestClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("testDatabaseUrl") }, { schema: inject("testSchema") }),
  });
}

/**
 * An active DS office that has no Child Rights Promotion Officer yet (ADM-3), for a test that adds
 * one. Test files share the schema, so they don't count on any particular office being free.
 */
export async function freeOfficeId(db: PrismaClient): Promise<number> {
  const office = await db.dsOffice.findFirstOrThrow({
    where: { active: true, users: { none: { role: "DS_OFFICER", banned: false } } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return office.id;
}
