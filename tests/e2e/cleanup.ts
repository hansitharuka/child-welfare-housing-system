/**
 * Tidies up after earlier end-to-end runs:
 * - removes the DS offices and building stages they added (everything carries TEST_MARKER), so a
 *   developer's lists don't fill up with test entries;
 * - disables the DS officer accounts they created, which frees those offices for the next run, since
 *   an office has only one active officer (ADM-3). The accounts stay, because the audit log refers to them.
 * Runs only where sample accounts are allowed (development and test databases).
 */
import "dotenv/config";
import { sampleUsersAllowed } from "../../prisma/seed-users";
import { createPrismaClient } from "../../src/server/db";
import { TEST_MARKER, TEST_OFFICER_NAME } from "./helpers";

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
    const officers = await prisma.user.updateMany({
      where: { name: TEST_OFFICER_NAME, role: "DS_OFFICER", banned: false },
      data: { banned: true },
    });
    console.log(
      `Removed test entries: ${offices.count} offices, ${stages.count} stages; disabled ${officers.count} test officers.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
