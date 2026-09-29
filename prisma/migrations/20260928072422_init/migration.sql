-- CreateEnum
CREATE TYPE "Kind" AS ENUM ('NEW_HOUSE', 'RENOVATION');

-- CreateTable
CREATE TABLE "province" (
    "id" SERIAL NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_si" TEXT NOT NULL,

    CONSTRAINT "province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district" (
    "id" SERIAL NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_si" TEXT NOT NULL,
    "province_id" INTEGER NOT NULL,

    CONSTRAINT "district_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ds_office" (
    "id" SERIAL NOT NULL,
    "code" CHAR(3) NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_si" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ds_office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_definition" (
    "id" SERIAL NOT NULL,
    "kind" "Kind" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name_si" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "case_id" TEXT,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "province_name_en_key" ON "province"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "province_name_si_key" ON "province"("name_si");

-- CreateIndex
CREATE UNIQUE INDEX "district_name_en_key" ON "district"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "district_name_si_key" ON "district"("name_si");

-- CreateIndex
CREATE INDEX "district_province_id_idx" ON "district"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "ds_office_code_key" ON "ds_office"("code");

-- CreateIndex
CREATE INDEX "ds_office_district_id_idx" ON "ds_office"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "ds_office_district_id_name_si_key" ON "ds_office"("district_id", "name_si");

-- CreateIndex
CREATE INDEX "stage_definition_kind_sort_order_idx" ON "stage_definition"("kind", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stage_definition_kind_name_si_key" ON "stage_definition"("kind", "name_si");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_case_id_idx" ON "audit_log"("case_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- AddForeignKey
ALTER TABLE "district" ADD CONSTRAINT "district_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ds_office" ADD CONSTRAINT "ds_office_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "district"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
