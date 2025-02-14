-- Drop existing table if it exists
DROP TABLE IF EXISTS "ApiKey";

-- CreateTable
CREATE TABLE "ApiKey" (
	"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	"key" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"userId" INTEGER NOT NULL,
	"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"expiresAt" DATETIME,
	"lastUsed" DATETIME,
	"requestCount" INTEGER NOT NULL DEFAULT 0,
	"lastReset" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"rateLimit" INTEGER NOT NULL DEFAULT 60,
	"ipRestrictions" TEXT,
	"active" BOOLEAN NOT NULL DEFAULT true,
	"permissions" TEXT NOT NULL DEFAULT '{}',
	FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");
CREATE INDEX "idx_api_key_user" ON "ApiKey"("userId");
CREATE INDEX "idx_api_key_active" ON "ApiKey"("active");