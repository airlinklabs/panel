-- CreateTable
CREATE TABLE "Addon" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL,
  "author" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mainFile" TEXT NOT NULL DEFAULT 'index.ts',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Addon_slug_key" ON "Addon"("slug");
