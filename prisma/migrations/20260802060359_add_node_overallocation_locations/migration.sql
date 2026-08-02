-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ram" INTEGER NOT NULL DEFAULT 0,
    "cpu" INTEGER NOT NULL DEFAULT 0,
    "disk" INTEGER NOT NULL DEFAULT 0,
    "overallocateMemory" INTEGER NOT NULL DEFAULT 0,
    "overallocateDisk" INTEGER NOT NULL DEFAULT 0,
    "overallocateCpu" INTEGER NOT NULL DEFAULT 0,
    "locationId" INTEGER,
    "address" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL DEFAULT 3001,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedPorts" TEXT DEFAULT '[]',
    "sftpPort" INTEGER NOT NULL DEFAULT 3003,
    CONSTRAINT "Node_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Node" ("address", "allocatedPorts", "cpu", "createdAt", "disk", "id", "key", "name", "port", "ram", "sftpPort") SELECT "address", "allocatedPorts", "cpu", "createdAt", "disk", "id", "key", "name", "port", "ram", "sftpPort" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
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
    "airlinkCloudBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 587,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFrom" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "s3Enabled" BOOLEAN NOT NULL DEFAULT false,
    "s3Endpoint" TEXT,
    "s3Region" TEXT,
    "s3Bucket" TEXT,
    "s3AccessKey" TEXT,
    "s3SecretKey" TEXT,
    "s3PathStyle" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_settings" ("airlinkCloudApiKey", "airlinkCloudBackupEnabled", "allowRegistration", "allowUserCreateServer", "allowUserDeleteServer", "bannedIps", "behindReverseProxy", "createdAt", "darkTheme", "defaultMaxCpu", "defaultMaxMemory", "defaultMaxStorage", "defaultServerLimit", "description", "enforceDaemonHttps", "favicon", "hashApiKeys", "id", "language", "lightTheme", "loginLockoutMinutes", "loginMaxAttempts", "loginWallpaper", "logo", "rateLimitEnabled", "rateLimitRpm", "registerWallpaper", "s3AccessKey", "s3Bucket", "s3Enabled", "s3Endpoint", "s3PathStyle", "s3Region", "s3SecretKey", "sftpPort", "smtpFrom", "smtpHost", "smtpPassword", "smtpPort", "smtpSecure", "smtpUser", "theme", "title", "updatedAt", "uploadLimit", "virusTotalApiKey") SELECT "airlinkCloudApiKey", "airlinkCloudBackupEnabled", "allowRegistration", "allowUserCreateServer", "allowUserDeleteServer", "bannedIps", "behindReverseProxy", "createdAt", "darkTheme", "defaultMaxCpu", "defaultMaxMemory", "defaultMaxStorage", "defaultServerLimit", "description", "enforceDaemonHttps", "favicon", "hashApiKeys", "id", "language", "lightTheme", "loginLockoutMinutes", "loginMaxAttempts", "loginWallpaper", "logo", "rateLimitEnabled", "rateLimitRpm", "registerWallpaper", "s3AccessKey", "s3Bucket", "s3Enabled", "s3Endpoint", "s3PathStyle", "s3Region", "s3SecretKey", "sftpPort", "smtpFrom", "smtpHost", "smtpPassword", "smtpPort", coalesce("smtpSecure", false) AS "smtpSecure", "smtpUser", "theme", "title", "updatedAt", "uploadLimit", "virusTotalApiKey" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Location_shortCode_key" ON "Location"("shortCode");
