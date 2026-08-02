-- AlterTable
ALTER TABLE "settings" ADD COLUMN "require2faForAdmins" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Mount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServerMount" (
    "serverId" TEXT NOT NULL,
    "mountId" INTEGER NOT NULL,

    PRIMARY KEY ("serverId", "mountId"),
    FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("mountId") REFERENCES "Mount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServerMount_serverId_idx" ON "ServerMount"("serverId");