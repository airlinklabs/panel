/*
  Warnings:

  - You are about to drop the column `name` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL DEFAULT 'Airlink',
    "description" TEXT NOT NULL DEFAULT 'Welcome to Airlink',
    "favicon" TEXT NOT NULL DEFAULT 'airlink.ico',
    "footer" TEXT NOT NULL DEFAULT 'Powered by Airlink',
    "copyright" TEXT NOT NULL DEFAULT '© 2025 Airlink',
    "logo" TEXT NOT NULL DEFAULT 'airlink.png',
    "theme" TEXT NOT NULL DEFAULT 'default',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
