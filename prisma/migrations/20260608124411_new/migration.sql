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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
