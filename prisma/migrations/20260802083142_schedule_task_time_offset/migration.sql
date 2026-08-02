-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scheduleId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "timeOffset" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ScheduleTask_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleTask" ("action", "id", "order", "payload", "scheduleId") SELECT "action", "id", "order", "payload", "scheduleId" FROM "ScheduleTask";
DROP TABLE "ScheduleTask";
ALTER TABLE "new_ScheduleTask" RENAME TO "ScheduleTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
