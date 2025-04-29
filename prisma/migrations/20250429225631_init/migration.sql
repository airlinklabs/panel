/*
  Warnings:

  - Added the required column `name` to the `ApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Node" ADD COLUMN "allocatedPorts" TEXT DEFAULT '[]';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApiKey" ("active", "createdAt", "id", "key") SELECT "active", "createdAt", "id", "key" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");
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
INSERT INTO "new_Server" ("Cpu", "Installing", "Memory", "Ports", "Queued", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId") SELECT "Cpu", "Installing", "Memory", "Ports", "Queued", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_UUID_key" ON "Server"("UUID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
