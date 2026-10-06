-- Written by hand. The import of the old sheet was removed on 6 Oct, while the sheet is still being
-- updated: its columns go, with the IMPORTED status and the CONFIRM_IMPORT decision it used. A case or
-- decision still holding one of them stops this migration, and nothing changes.
BEGIN;

-- The sheet's key, row, serial number and notes.
ALTER TABLE "case" DROP CONSTRAINT "case_sheet_reference";
DROP INDEX "case_sheet_key_key";
ALTER TABLE "case" DROP COLUMN "sheet_key",
DROP COLUMN "sheet_notes",
DROP COLUMN "sheet_row",
DROP COLUMN "sheet_serial";

-- The IMPORTED status. The check on status_before_stop names the old type, so it is made again after.
ALTER TABLE "case" DROP CONSTRAINT "case_status_before_stop";
CREATE TYPE "CaseStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'STOPPED');
ALTER TABLE "case" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "case" ALTER COLUMN "status" TYPE "CaseStatus_new" USING ("status"::text::"CaseStatus_new");
ALTER TABLE "case" ALTER COLUMN "status_before_stop" TYPE "CaseStatus_new" USING ("status_before_stop"::text::"CaseStatus_new");
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
DROP TYPE "CaseStatus_old";
ALTER TABLE "case" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
-- Only a stopped case remembers the status it goes back to when reopened (CLS-3).
ALTER TABLE "case" ADD CONSTRAINT "case_status_before_stop" CHECK (
  "status_before_stop" IS NULL OR ("status" = 'STOPPED' AND "status_before_stop" IN ('VERIFIED', 'IN_PROGRESS'))
);

-- The CONFIRM_IMPORT decision.
CREATE TYPE "DecisionType_new" AS ENUM ('SUBMIT', 'VERIFY', 'SEND_BACK', 'REJECT', 'STOP', 'REOPEN');
ALTER TABLE "decision" ALTER COLUMN "type" TYPE "DecisionType_new" USING ("type"::text::"DecisionType_new");
ALTER TYPE "DecisionType" RENAME TO "DecisionType_old";
ALTER TYPE "DecisionType_new" RENAME TO "DecisionType";
DROP TYPE "DecisionType_old";

COMMIT;
