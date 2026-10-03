/**
 * Tidies up after earlier end-to-end runs:
 * - removes the DS offices and building stages they added (everything carries TEST_MARKER), so a
 *   developer's lists don't fill up with test entries;
 * - disables the DS officer accounts they created, which frees those offices for the next run, since
 *   an office has only one active officer (ADM-3). The accounts stay, because the audit log refers to them;
 * - deletes the cases they created (named with TEST_CASE_NAME), with their files and photos, decisions,
 *   release, installments, stage updates and notifications.
 * Runs only where sample accounts are allowed (development and test databases).
 */
import "dotenv/config";
import { sampleUsersAllowed } from "../../prisma/seed-users";
import { createPrismaClient } from "../../src/server/db";
import { deleteStoredFile } from "../../src/server/files/storage";
import { TEST_CASE_NAME, TEST_MARKER, TEST_OFFICER_NAME } from "./helpers";

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
    // Cases the tests created, with everything that hangs off them. Their audit records stay (HIS-3).
    const cases = await prisma.case.findMany({ where: { name: { startsWith: TEST_CASE_NAME } }, select: { id: true } });
    const caseIds = cases.map((c) => c.id);
    const files = await prisma.storedFile.findMany({
      where: { caseId: { in: caseIds } },
      select: { storedName: true, thumbName: true },
    });
    await prisma.storedFile.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.notification.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.installment.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.release.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.stageUpdate.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.decision.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
    for (const name of files.flatMap((f) => [f.storedName, f.thumbName])) if (name) await deleteStoredFile(name);
    console.log(
      `Removed test entries: ${offices.count} offices, ${stages.count} stages, ${caseIds.length} cases; disabled ${officers.count} test officers.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
