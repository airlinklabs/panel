-- AlterTable
ALTER TABLE "Node" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN "backupIgnoreList" TEXT NOT NULL DEFAULT '';