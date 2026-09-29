/**
 * Removes the DS offices and building stages that earlier end-to-end runs added, so a developer's
 * lists don't fill up with test entries. Everything the tests add carries TEST_MARKER (see helpers.ts).
 * Accounts the tests create stay, because the audit log refers to them.
 * Runs only where sample accounts are allowed (development and test databases).
 */
import "dotenv/config";
import { sampleUsersAllowed } from "../../prisma/seed-users";
import { createPrismaClient } from "../../src/server/db";
import { TEST_MARKER } from "./helpers";

async function main() {
  if (!sampleUsersAllowed()) throw new Error("End-to-end cleanup only runs on development and test databases.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const prisma = createPrismaClient(databaseUrl);
  try {
    const offices = await prisma.dsOffice.deleteMany({
      where: { nameEn: { startsWith: `${TEST_MARKER} ` }, users: { none: {} } },
    });
    const stages = await prisma.stageDefinition.deleteMany({ where: { nameSi: { endsWith: ` ${TEST_MARKER}` } } });
    console.log(`Removed test entries: ${offices.count} offices, ${stages.count} stages.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
