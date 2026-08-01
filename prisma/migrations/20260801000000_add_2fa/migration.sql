-- AlterTable
ALTER TABLE "Users" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "Users" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
