-- AlterTable
ALTER TABLE "case" ADD COLUMN     "sheet_key" TEXT,
ADD COLUMN     "sheet_notes" JSONB,
ADD COLUMN     "sheet_row" INTEGER,
ADD COLUMN     "sheet_serial" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "case_sheet_key_key" ON "case"("sheet_key");


-- Written by hand; Prisma doesn't model check constraints, and `migrate dev` leaves them alone.
-- A case from the old sheet always knows its row there (IMP-7); a case entered in the system has neither.
ALTER TABLE "case" ADD CONSTRAINT "case_sheet_reference" CHECK (("sheet_key" IS NULL) = ("sheet_row" IS NULL));
