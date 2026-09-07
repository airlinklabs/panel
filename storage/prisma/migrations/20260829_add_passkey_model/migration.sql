-- AlterTable: Add passkeyEnabled to Users
ALTER TABLE "Users" ADD COLUMN "passkeyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WebAuthnCredential
CREATE TABLE "WebAuthnCredential" (
    "id" VARCHAR(36) NOT NULL,
    "credentialId" VARCHAR(1024) NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT NULL,
    "deviceName" VARCHAR(255) NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
