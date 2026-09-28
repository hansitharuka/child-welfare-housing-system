import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seed } from "./seed-data";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

seed(prisma)
  .then(async () => {
    const [provinces, districts, offices, stages] = await Promise.all([
      prisma.province.count(),
      prisma.district.count(),
      prisma.dsOffice.count(),
      prisma.stageDefinition.count(),
    ]);
    console.log(`Seeded: ${provinces} provinces, ${districts} districts, ${offices} DS offices, ${stages} stages.`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
