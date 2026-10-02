-- CreateEnum
CREATE TYPE "Category" AS ENUM ('CARE_LEAVER', 'CHILD_AT_RISK');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'STOPPED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('SUBMIT', 'VERIFY', 'SEND_BACK', 'REJECT', 'STOP', 'REOPEN', 'CONFIRM_IMPORT');

-- CreateTable
CREATE TABLE "case" (
    "id" TEXT NOT NULL,
    "case_number" TEXT,
    "ds_office_id" INTEGER NOT NULL,
    "category" "Category",
    "kind" "Kind",
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT,
    "child_name" TEXT,
    "nic" TEXT,
    "nic_key" TEXT,
    "address" TEXT,
    "mobile_1" TEXT,
    "mobile_2" TEXT,
    "remark" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_number_counter" (
    "ds_office_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "case_number_counter_pkey" PRIMARY KEY ("ds_office_id","year")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "type" "DecisionType" NOT NULL,
    "reason" TEXT,
    "by_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "stored_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" TEXT,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_case_number_key" ON "case"("case_number");

-- CreateIndex
CREATE INDEX "case_ds_office_id_status_idx" ON "case"("ds_office_id", "status");

-- CreateIndex
CREATE INDEX "case_status_submitted_at_idx" ON "case"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "case_nic_key_idx" ON "case"("nic_key");

-- CreateIndex
CREATE INDEX "case_updated_at_idx" ON "case"("updated_at");

-- CreateIndex
CREATE INDEX "decision_case_id_at_idx" ON "decision"("case_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "file_stored_name_key" ON "file"("stored_name");

-- CreateIndex
CREATE INDEX "file_case_id_idx" ON "file"("case_id");

-- CreateIndex
CREATE INDEX "file_uploaded_by_id_case_id_idx" ON "file"("uploaded_by_id", "case_id");

-- AddForeignKey
ALTER TABLE "case" ADD CONSTRAINT "case_ds_office_id_fkey" FOREIGN KEY ("ds_office_id") REFERENCES "ds_office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case" ADD CONSTRAINT "case_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
