-- An account is either disabled or not; there is no third state.
UPDATE "app_user" SET "banned" = false WHERE "banned" IS NULL;
ALTER TABLE "app_user" ALTER COLUMN "banned" SET NOT NULL;

-- Rules the Prisma schema cannot express (added by hand).

-- ADM-3: every DS office has one Child Rights Promotion Officer (ළමා හිමිකම් ප්‍රවර්ධන නිලධාරී), so it
-- has at most one active DS officer account. Disabled accounts keep their office for the history.
CREATE UNIQUE INDEX "app_user_one_active_ds_officer_per_office" ON "app_user" ("ds_office_id")
  WHERE "role" = 'DS_OFFICER' AND NOT "banned";
