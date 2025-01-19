/*
  Warnings:

  - You are about to drop the column `image` on the `Images` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "info" TEXT,
    "scripts" TEXT,
    "variables" TEXT
);
INSERT INTO "new_Images" ("UUID", "createdAt", "id", "name", "scripts", "variables") SELECT "UUID", "createdAt", "id", "name", "scripts", "variables" FROM "Images";
DROP TABLE "Images";
ALTER TABLE "new_Images" RENAME TO "Images";
CREATE UNIQUE INDEX "Images_UUID_key" ON "Images"("UUID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
