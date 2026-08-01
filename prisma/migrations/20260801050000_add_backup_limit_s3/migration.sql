-- AlterTable
ALTER TABLE "Server" ADD COLUMN "backupLimit" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3Enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3Endpoint" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3Region" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3Bucket" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3AccessKey" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3SecretKey" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "s3PathStyle" BOOLEAN NOT NULL DEFAULT false;
