-- CreateTable
CREATE TABLE "Users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT DEFAULT 'No About Me',
    "avatar" TEXT,
    "permissions" TEXT,
    "serverLimit" INTEGER,
    "maxMemory" INTEGER,
    "maxCpu" INTEGER,
    "maxStorage" INTEGER,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Ports" TEXT NOT NULL,
    "Memory" INTEGER NOT NULL,
    "Cpu" INTEGER NOT NULL,
    "Storage" INTEGER NOT NULL,
    "Variables" TEXT,
    "StartCommand" TEXT,
    "dockerImage" TEXT,
    "allowStartupEdit" BOOLEAN NOT NULL DEFAULT false,
    "Installing" BOOLEAN NOT NULL DEFAULT true,
    "Queued" BOOLEAN NOT NULL DEFAULT true,
    "Suspended" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "imageId" INTEGER NOT NULL,
    CONSTRAINT "Server_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Server_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Images" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "author" TEXT,
    "authorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,
    "dockerImages" TEXT,
    "startup" TEXT,
    "stop" TEXT,
    "startup_done" TEXT,
    "config_files" TEXT,
    "info" TEXT,
    "scripts" TEXT,
    "variables" TEXT
);

-- CreateTable
CREATE TABLE "Node" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ram" INTEGER NOT NULL DEFAULT 0,
    "cpu" INTEGER NOT NULL DEFAULT 0,
    "disk" INTEGER NOT NULL DEFAULT 0,
    "address" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL DEFAULT 3001,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedPorts" TEXT DEFAULT '[]',
    "sftpPort" INTEGER NOT NULL DEFAULT 3003
);

-- CreateTable
CREATE TABLE "settings" (
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
    "defaultMaxStorage" INTEGER NOT NULL DEFAULT 5,
    "loginWallpaper" TEXT,
    "registerWallpaper" TEXT,
    "loginMaxAttempts" INTEGER NOT NULL DEFAULT 5,
    "loginLockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "enforceDaemonHttps" BOOLEAN NOT NULL DEFAULT false,
    "behindReverseProxy" BOOLEAN NOT NULL DEFAULT false,
    "hashApiKeys" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ServerFolder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerFolderMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "folderId" INTEGER NOT NULL,
    "serverUUID" TEXT NOT NULL,
    CONSTRAINT "ServerFolderMember_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ServerFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerFolderMember_serverUUID_fkey" FOREIGN KEY ("serverUUID") REFERENCES "Server" ("UUID") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPlayers" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 0,
    "onlineServers" INTEGER NOT NULL DEFAULT 0,
    "totalServers" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Addon" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mainFile" TEXT NOT NULL DEFAULT 'index.ts',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "UUID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "size" BIGINT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Backup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SftpCredential" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SftpCredential_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_session_id_key" ON "Session"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "Server_UUID_key" ON "Server"("UUID");

-- CreateIndex
CREATE UNIQUE INDEX "Images_UUID_key" ON "Images"("UUID");

-- CreateIndex
CREATE INDEX "ServerFolder_ownerId_idx" ON "ServerFolder"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerFolderMember_serverUUID_key" ON "ServerFolderMember"("serverUUID");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "PlayerStats_timestamp_idx" ON "PlayerStats"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Addon_slug_key" ON "Addon"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Backup_UUID_key" ON "Backup"("UUID");

-- CreateIndex
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SftpCredential_serverId_key" ON "SftpCredential"("serverId");
