-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actorId" INTEGER,
    "serverId" TEXT,
    "event" TEXT NOT NULL,
    "metadata" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ActivityLog" ("actorId", "createdAt", "event", "id", "ip", "metadata", "serverId") SELECT "actorId", "createdAt", "event", "id", "ip", "metadata", "serverId" FROM "ActivityLog";
DROP TABLE "ActivityLog";
ALTER TABLE "new_ActivityLog" RENAME TO "ActivityLog";
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");
CREATE INDEX "ActivityLog_serverId_idx" ON "ActivityLog"("serverId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timeOffset" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("createdAt", "cron", "enabled", "id", "lastRunAt", "name", "nextRunAt", "serverId") SELECT "createdAt", "cron", "enabled", "id", "lastRunAt", "name", "nextRunAt", "serverId" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
