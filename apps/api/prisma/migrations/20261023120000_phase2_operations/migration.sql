-- AlterTable
ALTER TABLE `Document` MODIFY `type` ENUM('REQUIREMENT', 'MEASUREMENT', 'SITE_PHOTO', 'QUOTATION', 'BOQ', 'SOFT_DRAWING', 'CUSTOMER_APPROVAL', 'CAD', 'QC_REPORT', 'DELIVERY_CHALLAN', 'POD', 'INSTALLATION_PHOTO', 'HANDOVER_CERT', 'SERVICE_PHOTO', 'OTHER') NOT NULL;

-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `mentions` JSON NULL;

-- CreateTable
CREATE TABLE `PaymentMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `kind` ENUM('ADVANCE', 'PRE_DISPATCH', 'FINAL', 'OTHER') NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'RECEIVED', 'WAIVED') NOT NULL DEFAULT 'PENDING',
    `receivedAt` DATETIME(3) NULL,
    `receivedAmount` DECIMAL(14, 2) NULL,
    `mode` VARCHAR(30) NULL,
    `reference` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `recordedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentMilestone_projectId_idx`(`projectId`),
    INDEX `PaymentMilestone_status_dueDate_idx`(`status`, `dueDate`),
    INDEX `PaymentMilestone_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionItem` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `spec` TEXT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'NOT_STARTED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `qcStatus` ENUM('PENDING', 'PASSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `qcNotes` TEXT NULL,
    `qcById` VARCHAR(191) NULL,
    `qcAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductionItem_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DispatchTrip` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `tripNo` INTEGER NOT NULL,
    `plannedDate` DATETIME(3) NOT NULL,
    `vehicleNo` VARCHAR(30) NULL,
    `driverName` VARCHAR(120) NULL,
    `driverPhone` VARCHAR(20) NULL,
    `challanNo` VARCHAR(60) NULL,
    `ewayBillNo` VARCHAR(60) NULL,
    `itemsNote` TEXT NULL,
    `status` ENUM('PLANNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `dispatchedAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `receivedByName` VARCHAR(120) NULL,
    `podDocumentId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DispatchTrip_plannedDate_status_idx`(`plannedDate`, `status`),
    UNIQUE INDEX `DispatchTrip_projectId_tripNo_key`(`projectId`, `tripNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Snag` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `resolution` TEXT NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Snag_projectId_status_idx`(`projectId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Handover` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `signedByName` VARCHAR(120) NOT NULL,
    `signedByPhone` VARCHAR(20) NULL,
    `signedAt` DATETIME(3) NOT NULL,
    `warrantyMonths` INTEGER NOT NULL,
    `warrantyStart` DATETIME(3) NOT NULL,
    `warrantyEnd` DATETIME(3) NOT NULL,
    `trainingDone` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `certificateDocumentId` VARCHAR(191) NULL,
    `recordedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Handover_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceTicket` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `underWarranty` BOOLEAN NOT NULL DEFAULT false,
    `contactName` VARCHAR(120) NULL,
    `contactPhone` VARCHAR(20) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `slaAlerted` BOOLEAN NOT NULL DEFAULT false,
    `resolution` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `csatRating` INTEGER NULL,
    `csatComment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServiceTicket_code_key`(`code`),
    INDEX `ServiceTicket_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `ServiceTicket_projectId_idx`(`projectId`),
    INDEX `ServiceTicket_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `ServiceTicket_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceVisit` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `technicianId` VARCHAR(191) NOT NULL,
    `visitDate` DATETIME(3) NOT NULL,
    `workDone` TEXT NOT NULL,
    `partsUsed` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServiceVisit_ticketId_visitDate_idx`(`ticketId`, `visitDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSetting` (
    `key` VARCHAR(80) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentMilestone` ADD CONSTRAINT `PaymentMilestone_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentMilestone` ADD CONSTRAINT `PaymentMilestone_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentMilestone` ADD CONSTRAINT `PaymentMilestone_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionItem` ADD CONSTRAINT `ProductionItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionItem` ADD CONSTRAINT `ProductionItem_qcById_fkey` FOREIGN KEY (`qcById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DispatchTrip` ADD CONSTRAINT `DispatchTrip_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DispatchTrip` ADD CONSTRAINT `DispatchTrip_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Snag` ADD CONSTRAINT `Snag_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Snag` ADD CONSTRAINT `Snag_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Snag` ADD CONSTRAINT `Snag_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Handover` ADD CONSTRAINT `Handover_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Handover` ADD CONSTRAINT `Handover_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceVisit` ADD CONSTRAINT `ServiceVisit_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceVisit` ADD CONSTRAINT `ServiceVisit_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

