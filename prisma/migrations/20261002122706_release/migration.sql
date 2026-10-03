-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'RELEASED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SENT_BACK', 'VERIFIED', 'REJECTED', 'RELEASED', 'COMPLETED', 'STOPPED', 'REOPENED');

-- AlterTable
ALTER TABLE "case" ADD COLUMN     "verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "release" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "released_on" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference_number" TEXT NOT NULL,
    "note" TEXT,
    "by_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "purpose" TEXT,
    "expected_on" DATE,
    "released_on" DATE,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_case_id_key" ON "release"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "installment_case_id_number_key" ON "installment"("case_id", "number");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_idx" ON "notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_case_id_idx" ON "notification"("case_id");

-- CreateIndex
CREATE INDEX "case_status_verified_at_idx" ON "case"("status", "verified_at");

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment" ADD CONSTRAINT "installment_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Written by hand; Prisma doesn't model check constraints, and `migrate dev` leaves them alone.
-- The amounts are fixed (SPEC section 5): Rs. 2,000,000 per case, in four installments of Rs. 500,000.
ALTER TABLE "release" ADD CONSTRAINT "release_amount_fixed" CHECK ("amount" = 2000000);
ALTER TABLE "installment" ADD CONSTRAINT "installment_amount_fixed" CHECK ("amount" = 500000);
ALTER TABLE "installment" ADD CONSTRAINT "installment_number_1_to_4" CHECK ("number" BETWEEN 1 AND 4);
