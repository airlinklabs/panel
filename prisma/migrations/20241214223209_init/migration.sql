/*
  Warnings:

  - You are about to drop the column `apiKey` on the `Node` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ram" INTEGER NOT NULL DEFAULT 0,
    "cpu" INTEGER NOT NULL DEFAULT 0,
    "disk" INTEGER NOT NULL DEFAULT 0,
    "address" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL DEFAULT 3001,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Node" ("address", "cpu", "createdAt", "disk", "id", "key", "name", "port", "ram") SELECT "address", "cpu", "createdAt", "disk", "id", "key", "name", "port", "ram" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
