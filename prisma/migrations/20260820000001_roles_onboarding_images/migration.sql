-- Phase 9: roles, onboarding state, image approval, privileged limits
-- AlterTable
ALTER TABLE "Users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Users" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Users" ADD COLUMN "onboardingSkipped" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing admins as the 'admin' role; the first user becomes owner.
UPDATE "Users" SET "role" = 'owner' WHERE "id" = (SELECT "id" FROM "Users" WHERE "isAdmin" = 1 ORDER BY "id" ASC LIMIT 1);
UPDATE "Users" SET "role" = 'admin' WHERE "isAdmin" = 1 AND "role" = 'user';

-- AlterTable
ALTER TABLE "Images" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Images" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "Images" ADD COLUMN "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "allowPrivilegedServerLimit" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "settings" ADD COLUMN "allowPrivilegedMaxMemory" INTEGER NOT NULL DEFAULT 2048;
ALTER TABLE "settings" ADD COLUMN "allowPrivilegedMaxCpu" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "settings" ADD COLUMN "allowPrivilegedMaxStorage" INTEGER NOT NULL DEFAULT 61440;
ALTER TABLE "settings" ADD COLUMN "allowPrivilegedMaxDatabases" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "settings" ADD COLUMN "allowUserCreateImages" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "onboardingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "onboardingSteps" TEXT NOT NULL DEFAULT '[]';