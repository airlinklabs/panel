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
    CONSTRAINT "Backup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Backup" ("UUID", "createdAt", "filePath", "id", "name", "serverId", "size") SELECT "UUID", "createdAt", "filePath", "id", "name", "serverId", "size" FROM "Backup";
DROP TABLE "Backup";
ALTER TABLE "new_Backup" RENAME TO "Backup";
CREATE UNIQUE INDEX "Backup_UUID_key" ON "Backup"("UUID");
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");
CREATE TABLE "new_Images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "author" TEXT,
    "authorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,
    "dockerImages" TEXT,
    "startup" TEXT,
    "stop" TEXT,
    "startup_done" TEXT,
    "config_files" TEXT,
    "info" TEXT,
    "scripts" TEXT,
    "variables" TEXT
);
INSERT INTO "new_Images" ("UUID", "author", "authorName", "config_files", "createdAt", "description", "dockerImages", "id", "info", "meta", "name", "scripts", "startup", "startup_done", "stop", "variables") SELECT "UUID", "author", "authorName", "config_files", "createdAt", "description", "dockerImages", "id", "info", "meta", "name", "scripts", "startup", "startup_done", "stop", "variables" FROM "Images";
DROP TABLE "Images";
ALTER TABLE "new_Images" RENAME TO "Images";
CREATE UNIQUE INDEX "Images_UUID_key" ON "Images"("UUID");
CREATE TABLE "new_Server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Ports" TEXT NOT NULL,
    "Memory" INTEGER NOT NULL,
    "Cpu" INTEGER NOT NULL,
    "Storage" INTEGER NOT NULL,
    "Variables" TEXT,
    "StartCommand" TEXT,
    "dockerImage" TEXT,
    "allowStartupEdit" BOOLEAN NOT NULL DEFAULT false,
    "Installing" BOOLEAN NOT NULL DEFAULT true,
    "Queued" BOOLEAN NOT NULL DEFAULT true,
    "Suspended" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "imageId" INTEGER NOT NULL,
    CONSTRAINT "Server_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Images" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("Cpu", "Installing", "Memory", "Ports", "Queued", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "allowStartupEdit", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId") SELECT "Cpu", "Installing", "Memory", "Ports", "Queued", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "allowStartupEdit", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_UUID_key" ON "Server"("UUID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
