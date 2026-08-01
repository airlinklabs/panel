-- AlterTable
ALTER TABLE "settings" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "settings" ADD COLUMN "smtpPort" INTEGER DEFAULT 587;
ALTER TABLE "settings" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "settings" ADD COLUMN "smtpPassword" TEXT;
ALTER TABLE "settings" ADD COLUMN "smtpFrom" TEXT;
ALTER TABLE "settings" ADD COLUMN "smtpSecure" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
