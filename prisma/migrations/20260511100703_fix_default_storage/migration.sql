-- AlterTable
ALTER TABLE "Backup" ADD COLUMN "airlinkCloudId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL DEFAULT 'Airlink',
    "description" TEXT NOT NULL DEFAULT 'AirLink is a free and open source project by AirlinkLabs',
    "logo" TEXT NOT NULL DEFAULT '../assets/logo.png',
    "favicon" TEXT NOT NULL DEFAULT '../assets/favicon.ico',
    "theme" TEXT NOT NULL DEFAULT 'default',
    "lightTheme" TEXT NOT NULL DEFAULT 'default',
    "darkTheme" TEXT NOT NULL DEFAULT 'default',
    "language" TEXT NOT NULL DEFAULT 'en',
    "allowRegistration" BOOLEAN NOT NULL DEFAULT false,
    "uploadLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sftpPort" INTEGER NOT NULL DEFAULT 3003,
    "virusTotalApiKey" TEXT,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitRpm" INTEGER NOT NULL DEFAULT 100,
    "bannedIps" TEXT NOT NULL DEFAULT '[]',
    "allowUserCreateServer" BOOLEAN NOT NULL DEFAULT false,
    "allowUserDeleteServer" BOOLEAN NOT NULL DEFAULT false,
    "defaultServerLimit" INTEGER NOT NULL DEFAULT 0,
    "defaultMaxMemory" INTEGER NOT NULL DEFAULT 512,
    "defaultMaxCpu" INTEGER NOT NULL DEFAULT 100,
    "defaultMaxStorage" INTEGER NOT NULL DEFAULT 5120,
    "loginWallpaper" TEXT,
    "registerWallpaper" TEXT,
    "loginMaxAttempts" INTEGER NOT NULL DEFAULT 5,
    "loginLockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "enforceDaemonHttps" BOOLEAN NOT NULL DEFAULT false,
    "behindReverseProxy" BOOLEAN NOT NULL DEFAULT false,
    "hashApiKeys" BOOLEAN NOT NULL DEFAULT false,
    "airlinkCloudApiKey" TEXT,
    "airlinkCloudBackupEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_settings" ("allowRegistration", "allowUserCreateServer", "allowUserDeleteServer", "bannedIps", "behindReverseProxy", "createdAt", "darkTheme", "defaultMaxCpu", "defaultMaxMemory", "defaultMaxStorage", "defaultServerLimit", "description", "enforceDaemonHttps", "favicon", "hashApiKeys", "id", "language", "lightTheme", "loginLockoutMinutes", "loginMaxAttempts", "loginWallpaper", "logo", "rateLimitEnabled", "rateLimitRpm", "registerWallpaper", "sftpPort", "theme", "title", "updatedAt", "uploadLimit", "virusTotalApiKey") SELECT "allowRegistration", "allowUserCreateServer", "allowUserDeleteServer", "bannedIps", "behindReverseProxy", "createdAt", "darkTheme", "defaultMaxCpu", "defaultMaxMemory", "defaultMaxStorage", "defaultServerLimit", "description", "enforceDaemonHttps", "favicon", "hashApiKeys", "id", "language", "lightTheme", "loginLockoutMinutes", "loginMaxAttempts", "loginWallpaper", "logo", "rateLimitEnabled", "rateLimitRpm", "registerWallpaper", "sftpPort", "theme", "title", "updatedAt", "uploadLimit", "virusTotalApiKey" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
