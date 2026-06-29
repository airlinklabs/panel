-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT DEFAULT 'No About Me',
    "avatar" TEXT,
    "permissions" TEXT DEFAULT '[]',
    "serverLimit" INTEGER DEFAULT 0,
    "maxMemory" INTEGER DEFAULT 0,
    "maxCpu" INTEGER DEFAULT 0,
    "maxStorage" INTEGER DEFAULT 0,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "animationsDisabled" BOOLEAN NOT NULL DEFAULT false,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "compactMode" BOOLEAN NOT NULL DEFAULT false,
    "fontSize" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Users" ("animationsDisabled", "avatar", "createdAt", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxMemory", "maxStorage", "password", "permissions", "serverLimit", "updatedAt", "username") SELECT "animationsDisabled", "avatar", "createdAt", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxMemory", "maxStorage", "password", "permissions", "serverLimit", "updatedAt", "username" FROM "Users";
DROP TABLE "Users";
ALTER TABLE "new_Users" RENAME TO "Users";
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
