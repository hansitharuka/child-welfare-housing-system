-- Written by hand (6 Oct 2026): Head Office now releases money by allocation letter to a District
-- Secretary, one letter for several verified cases of the district (REL-2). Each case keeps its own
-- release row, which now points to its letter; the reference number and note move to the letter.

-- CreateTable
CREATE TABLE "release_letter" (
    "id" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,
    "letter_number" TEXT NOT NULL,
    "letter_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "note" TEXT,
    "by_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_letter_pkey" PRIMARY KEY ("id")
);

-- Each release recorded before letters existed becomes a letter of its own, under the same id, for its
-- case's district: its reference number, date and note, valid until the end of that year.
INSERT INTO "release_letter" ("id", "district_id", "letter_number", "letter_date", "valid_until", "note", "by_id", "at")
SELECT r."id", o."district_id", r."reference_number", r."released_on",
       make_date(extract(year FROM r."released_on")::int, 12, 31), r."note", r."by_id", r."at"
FROM "release" r
JOIN "case" c ON c."id" = r."case_id"
JOIN "ds_office" o ON o."id" = c."ds_office_id";

-- AlterTable
ALTER TABLE "release" ADD COLUMN "letter_id" TEXT;
UPDATE "release" SET "letter_id" = "id";
ALTER TABLE "release" ALTER COLUMN "letter_id" SET NOT NULL;
ALTER TABLE "release" DROP COLUMN "note", DROP COLUMN "reference_number";

-- AlterTable
ALTER TABLE "file" ADD COLUMN "letter_id" TEXT;

-- CreateIndex
CREATE INDEX "release_letter_at_idx" ON "release_letter"("at");

-- CreateIndex
CREATE INDEX "file_letter_id_idx" ON "file"("letter_id");

-- CreateIndex
CREATE INDEX "release_letter_id_idx" ON "release"("letter_id");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "release_letter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_letter" ADD CONSTRAINT "release_letter_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "district"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_letter" ADD CONSTRAINT "release_letter_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "release_letter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma doesn't model check constraints, and `migrate dev` leaves them alone.
ALTER TABLE "release_letter" ADD CONSTRAINT "release_letter_valid_from_its_date" CHECK ("valid_until" >= "letter_date");
-- Only a letter scan belongs to a letter, and a letter scan never belongs to a case.
ALTER TABLE "file" ADD CONSTRAINT "file_only_scans_on_letters" CHECK ("letter_id" IS NULL OR "kind" = 'LETTER');
ALTER TABLE "file" ADD CONSTRAINT "file_scans_not_on_cases" CHECK ("kind" <> 'LETTER' OR ("case_id" IS NULL AND "stage_update_id" IS NULL));
