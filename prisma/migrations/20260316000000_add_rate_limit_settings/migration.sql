-- Add rate limiting configuration and banned IPs to settings
ALTER TABLE "settings" ADD COLUMN "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "rateLimitRpm" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "settings" ADD COLUMN "bannedIps" TEXT NOT NULL DEFAULT '[]';
