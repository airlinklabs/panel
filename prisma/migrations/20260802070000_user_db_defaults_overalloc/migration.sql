-- AlterTable
ALTER TABLE "settings" ADD COLUMN "defaultMaxDatabases" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN "defaultOverallocateMemory" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN "defaultOverallocateDisk" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN "defaultOverallocateCpu" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Users" ADD COLUMN "maxDatabases" INTEGER DEFAULT 0;