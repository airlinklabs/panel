-- AlterTable: Add passkeyEnabled to Users
ALTER TABLE `Users` ADD COLUMN `passkeyEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WebAuthnCredential
CREATE TABLE `WebAuthnCredential` (
    `id` VARCHAR(36) NOT NULL,
    `credentialId` VARCHAR(1024) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` BIGINT NOT NULL DEFAULT 0,
    `transports` TEXT NULL,
    `deviceName` VARCHAR(255) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebAuthnCredential_credentialId_key`(`credentialId`),
    INDEX `WebAuthnCredential_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WebAuthnCredential` ADD CONSTRAINT `WebAuthnCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
