-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('DOCUMENT', 'PHOTO');

-- AlterTable
ALTER TABLE "case" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "status_before_stop" "CaseStatus";

-- AlterTable
ALTER TABLE "file" ADD COLUMN     "kind" "FileKind" NOT NULL DEFAULT 'DOCUMENT',
ADD COLUMN     "stage_update_id" TEXT;

-- CreateTable
CREATE TABLE "stage_update" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "stage_id" INTEGER,
    "visited_on" DATE NOT NULL,
    "note" TEXT,
    "by_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_update_case_id_at_idx" ON "stage_update"("case_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "stage_update_case_id_stage_id_key" ON "stage_update"("case_id", "stage_id");

-- CreateIndex
CREATE INDEX "file_stage_update_id_idx" ON "file"("stage_update_id");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_stage_update_id_fkey" FOREIGN KEY ("stage_update_id") REFERENCES "stage_update"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_update" ADD CONSTRAINT "stage_update_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_update" ADD CONSTRAINT "stage_update_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_update" ADD CONSTRAINT "stage_update_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Written by hand; Prisma doesn't model check constraints, and `migrate dev` leaves them alone.
-- Only a photo belongs to a stage update (STG-1); a document belongs to the case alone (CASE-2).
ALTER TABLE "file" ADD CONSTRAINT "file_only_photos_on_stage_updates" CHECK ("stage_update_id" IS NULL OR "kind" = 'PHOTO');
-- Only a stopped case remembers the status it goes back to when reopened (CLS-3).
ALTER TABLE "case" ADD CONSTRAINT "case_status_before_stop" CHECK (
  "status_before_stop" IS NULL OR ("status" = 'STOPPED' AND "status_before_stop" IN ('VERIFIED', 'IN_PROGRESS'))
);
