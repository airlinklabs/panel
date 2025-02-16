-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "Installing" BOOLEAN NOT NULL DEFAULT true,
    "Suspended" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "imageId" INTEGER NOT NULL,
    CONSTRAINT "Server_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Images" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("Cpu", "Memory", "Ports", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId") SELECT "Cpu", "Memory", "Ports", "StartCommand", "Storage", "Suspended", "UUID", "Variables", "createdAt", "description", "dockerImage", "id", "imageId", "name", "nodeId", "ownerId" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_UUID_key" ON "Server"("UUID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
