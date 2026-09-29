import "dotenv/config";
import { createPrismaClient } from "../src/server/db";
import { seed } from "./seed-data";
import { putSampleUsers, sampleUsersAllowed } from "./seed-users";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const prisma = createPrismaClient(databaseUrl);

async function main() {
  await seed(prisma);
  const [provinces, districts, offices, stages] = await Promise.all([
    prisma.province.count(),
    prisma.district.count(),
    prisma.dsOffice.count(),
    prisma.stageDefinition.count(),
  ]);
  console.log(`Seeded: ${provinces} provinces, ${districts} districts, ${offices} DS offices, ${stages} stages.`);

  if (sampleUsersAllowed()) {
    const added = await putSampleUsers(prisma, { reset: false });
    console.log(`Sample accounts added: ${added} (development and tests only).`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
