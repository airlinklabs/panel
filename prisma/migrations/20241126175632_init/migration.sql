-- CreateTable
CREATE TABLE "Images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image" TEXT NOT NULL,
    "scripts" TEXT,
    "variables" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Images_UUID_key" ON "Images"("UUID");
