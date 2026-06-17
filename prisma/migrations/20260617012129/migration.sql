/*
  Warnings:

  - Added the required column `updatedAt` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "AddonSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "addonSlug" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Backup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "size" BIGINT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "airlinkCloudId" TEXT,
    CONSTRAINT "Backup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Backup" ("UUID", "airlinkCloudId", "createdAt", "filePath", "id", "name", "serverId", "size") SELECT "UUID", "airlinkCloudId", "createdAt", "filePath", "id", "name", "serverId", "size" FROM "Backup";
DROP TABLE "Backup";
ALTER TABLE "new_Backup" RENAME TO "Backup";
CREATE UNIQUE INDEX "Backup_UUID_key" ON "Backup"("UUID");
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");
CREATE TABLE "new_SftpCredential" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SftpCredential_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SftpCredential" ("createdAt", "expiresAt", "host", "id", "password", "port", "serverId", "username") SELECT "createdAt", "expiresAt", "host", "id", "password", "port", "serverId", "username" FROM "SftpCredential";
DROP TABLE "SftpCredential";
ALTER TABLE "new_SftpCredential" RENAME TO "SftpCredential";
CREATE UNIQUE INDEX "SftpCredential_serverId_key" ON "SftpCredential"("serverId");
CREATE TABLE "new_Users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT DEFAULT 'No About Me',
    "avatar" TEXT,
    "permissions" TEXT DEFAULT '[]',
    "serverLimit" INTEGER DEFAULT 0,
    "maxMemory" INTEGER DEFAULT 0,
    "maxCpu" INTEGER DEFAULT 0,
    "maxStorage" INTEGER DEFAULT 0,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Users" ("avatar", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxMemory", "maxStorage", "password", "permissions", "serverLimit", "username") SELECT "avatar", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxMemory", "maxStorage", "password", "permissions", "serverLimit", "username" FROM "Users";
DROP TABLE "Users";
ALTER TABLE "new_Users" RENAME TO "Users";
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AddonSetting_addonSlug_key_key" ON "AddonSetting"("addonSlug", "key");
