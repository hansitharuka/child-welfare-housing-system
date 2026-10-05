/**
 * Makes a made-up case as the sheet import leaves it (SEC-11), at Homagama: no kind, NIC or phone
 * number, with notes from the sheet. The sheet's three phone numbers couldn't all be stored, so the cell
 * is kept. Prints the case's id, name and that cell as JSON. Its name starts with TEST_CASE_NAME, so
 * cleanup.ts removes it before the next run.
 *
 * It runs as its own process (`npx tsx`), like cleanup.ts, because Playwright can't load Prisma's
 * generated client.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sampleUsersAllowed } from "../../prisma/seed-users";
import { createPrismaClient } from "../../src/server/db";
import { TEST_CASE_NAME } from "./helpers";

const SHEET_PHONE = "077 1234567 071 2345678 011 2345678";

async function main() {
  if (!sampleUsersAllowed()) throw new Error("End-to-end test data only goes into development and test databases.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const prisma = createPrismaClient(databaseUrl);
  try {
    const id = randomUUID();
    const name = `${TEST_CASE_NAME} පත්‍රිකාව ${Date.now()}`;
    const office = await prisma.dsOffice.findUniqueOrThrow({ where: { code: "HMG" } });
    const creator = await prisma.user.findFirstOrThrow({ where: { username: "ho0001" } });
    await prisma.case.create({
      data: {
        id,
        dsOfficeId: office.id,
        category: "CARE_LEAVER",
        status: "IMPORTED",
        name,
        address: "නො. 1, පරීක්ෂණ පාර",
        createdById: creator.id,
        sheetKey: `e2e:${id}`,
        sheetRow: 2,
        sheetNotes: {
          installments: ["ඔව්", "2026 දෙසැම්බර් මාසයේ බලාපොරොත්තු වේ", null, null],
          levels: [null, null, null, null],
          remark: null,
          phone: SHEET_PHONE,
        },
      },
    });
    console.log(JSON.stringify({ id, name, sheetPhone: SHEET_PHONE }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
