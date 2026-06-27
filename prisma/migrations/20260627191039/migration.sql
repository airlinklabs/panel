-- CreateTable
CREATE TABLE "EggCatalog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "category" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subGroup" TEXT,
    "downloadUrl" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "eggData" TEXT NOT NULL,
    "readme" TEXT,
    "fullReadme" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CategoryMD" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "serverId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("createdAt", "id", "message", "read", "serverId", "title", "type", "userId") SELECT "createdAt", "id", "message", "read", "serverId", "title", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EggCatalog_filePath_key" ON "EggCatalog"("filePath");

-- CreateIndex
CREATE INDEX "EggCatalog_category_idx" ON "EggCatalog"("category");

-- CreateIndex
CREATE INDEX "EggCatalog_group_idx" ON "EggCatalog"("group");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMD_category_key" ON "CategoryMD"("category");
