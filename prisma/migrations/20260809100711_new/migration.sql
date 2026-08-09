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
    "maxDatabases" INTEGER DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'user',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingSkipped" BOOLEAN NOT NULL DEFAULT false,
    "preferredNodeId" INTEGER,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpRecoveryCodes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Users_preferredNodeId_fkey" FOREIGN KEY ("preferredNodeId") REFERENCES "Node" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Users" ("avatar", "createdAt", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxDatabases", "maxMemory", "maxStorage", "onboardingCompleted", "onboardingSkipped", "password", "permissions", "preferredNodeId", "role", "serverLimit", "totpEnabled", "totpRecoveryCodes", "totpSecret", "updatedAt", "username") SELECT "avatar", "createdAt", "description", "email", "id", "isAdmin", "lockedUntil", "loginAttempts", "maxCpu", "maxDatabases", "maxMemory", "maxStorage", "onboardingCompleted", "onboardingSkipped", "password", "permissions", "preferredNodeId", "role", "serverLimit", "totpEnabled", "totpRecoveryCodes", "totpSecret", "updatedAt", "username" FROM "Users";
DROP TABLE "Users";
ALTER TABLE "new_Users" RENAME TO "Users";
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
