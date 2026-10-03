-- AlterTable
ALTER TABLE "file" ADD COLUMN     "thumb_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "file_thumb_name_key" ON "file"("thumb_name");

