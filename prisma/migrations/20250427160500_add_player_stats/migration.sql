-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPlayers" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 0,
    "onlineServers" INTEGER NOT NULL DEFAULT 0,
    "totalServers" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PlayerStats_timestamp_idx" ON "PlayerStats"("timestamp");
