-- AlterTable
ALTER TABLE `User` ADD COLUMN `dateOfBirth` DATE NULL,
    ADD COLUMN `dateOfJoining` DATE NULL,
    ADD COLUMN `department` VARCHAR(80) NULL,
    ADD COLUMN `displayName` VARCHAR(80) NULL,
    ADD COLUMN `employeeCode` VARCHAR(30) NULL,
    ADD COLUMN `employmentType` VARCHAR(30) NULL,
    ADD COLUMN `gender` VARCHAR(20) NULL,
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `User_employeeCode_key` ON `User`(`employeeCode`);

