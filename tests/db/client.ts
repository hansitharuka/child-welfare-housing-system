import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

/** A Prisma client bound to this test run's own schema (see global-setup.ts). */
export function createTestClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("testDatabaseUrl") }, { schema: inject("testSchema") }),
  });
}
