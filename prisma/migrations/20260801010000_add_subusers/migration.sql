-- CreateTable
CREATE TABLE "SubUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubUser_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SubUser_serverId_userId_key" ON "SubUser"("serverId", "userId");

-- CreateIndex
CREATE INDEX "SubUser_serverId_idx" ON "SubUser"("serverId");

-- CreateIndex
CREATE INDEX "SubUser_userId_idx" ON "SubUser"("userId");
