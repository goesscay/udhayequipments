-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `code` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Team_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Permission_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `scope` ENUM('OWN', 'TEAM', 'ALL') NOT NULL,

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `roleId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    INDEX `User_teamId_idx`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `gstin` VARCHAR(20) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Customer_name_idx`(`name`),
    INDEX `Customer_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `siteAddress` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `requirement` TEXT NULL,
    `estimatedValue` DECIMAL(14, 2) NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('ACTIVE', 'ON_HOLD', 'LOST', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `currentStage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NOT NULL DEFAULT 'LEAD',
    `currentTeam` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL DEFAULT 'SALES',
    `stageDueAt` DATETIME(3) NULL,
    `holdReason` TEXT NULL,
    `salesOwnerId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Project_code_key`(`code`),
    INDEX `Project_status_currentStage_idx`(`status`, `currentStage`),
    INDEX `Project_currentTeam_status_idx`(`currentTeam`, `status`),
    INDEX `Project_stageDueAt_idx`(`stageDueAt`),
    INDEX `Project_customerId_idx`(`customerId`),
    INDEX `Project_salesOwnerId_idx`(`salesOwnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectStage` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `stage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NOT NULL,
    `team` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL,
    `cycle` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('OPEN', 'DONE', 'RETURNED') NOT NULL DEFAULT 'OPEN',
    `assigneeId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `acceptedById` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `slaAlertLevel` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProjectStage_projectId_stage_idx`(`projectId`, `stage`),
    INDEX `ProjectStage_status_team_idx`(`status`, `team`),
    INDEX `ProjectStage_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `ProjectStage_assigneeId_status_idx`(`assigneeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageTransition` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `fromStage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NULL,
    `toStage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NULL,
    `action` VARCHAR(40) NOT NULL,
    `reason` TEXT NULL,
    `byUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StageTransition_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `StageTransition_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `stage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NOT NULL,
    `type` ENUM('REQUIREMENT', 'MEASUREMENT', 'SITE_PHOTO', 'QUOTATION', 'BOQ', 'SOFT_DRAWING', 'CUSTOMER_APPROVAL', 'CAD', 'QC_REPORT', 'DELIVERY_CHALLAN', 'POD', 'INSTALLATION_PHOTO', 'HANDOVER_CERT', 'OTHER') NOT NULL,
    `version` INTEGER NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(150) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Document_projectId_type_idx`(`projectId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `Notification_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `stage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NULL,
    `body` TEXT NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Comment_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `entity` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `data` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobLock` (
    `name` VARCHAR(60) NOT NULL,
    `lockedUntil` DATETIME(3) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastResult` JSON NULL,
    `lastError` TEXT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageSetting` (
    `stage` ENUM('LEAD', 'SITE_SURVEY', 'QUOTATION_PREP', 'QUOTATION_SHARED', 'CUSTOMER_DECISION', 'BOQ_DRAWING', 'LAYOUT_APPROVAL', 'CAD_DRAWING', 'HEAD_APPROVAL', 'PRODUCTION', 'DISPATCH', 'INSTALLATION', 'HANDOVER', 'SERVICE') NOT NULL,
    `slaHours` INTEGER NOT NULL,

    PRIMARY KEY (`stage`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_salesOwnerId_fkey` FOREIGN KEY (`salesOwnerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectStage` ADD CONSTRAINT `ProjectStage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectStage` ADD CONSTRAINT `ProjectStage_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectStage` ADD CONSTRAINT `ProjectStage_acceptedById_fkey` FOREIGN KEY (`acceptedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StageTransition` ADD CONSTRAINT `StageTransition_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StageTransition` ADD CONSTRAINT `StageTransition_byUserId_fkey` FOREIGN KEY (`byUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

