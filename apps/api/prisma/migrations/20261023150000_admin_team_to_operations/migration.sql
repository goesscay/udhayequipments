-- Rename the workflow team ADMIN (prepares quotations and BOQ) to OPERATIONS without losing data.
-- The Admin *role* is a separate thing (Role.code = 'ADMIN') and is not touched here.

-- 1. Allow both values while rows move across.
ALTER TABLE `Team` MODIFY `code` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL;
ALTER TABLE `Project` MODIFY `currentTeam` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL DEFAULT 'SALES';
ALTER TABLE `ProjectStage` MODIFY `team` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'ADMIN', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL;

-- 2. Move the team (its users keep their teamId, so they move with it), open projects and stage history.
UPDATE `Team` SET `code` = 'OPERATIONS', `name` = 'Operations' WHERE `code` = 'ADMIN';
UPDATE `Project` SET `currentTeam` = 'OPERATIONS' WHERE `currentTeam` = 'ADMIN';
UPDATE `ProjectStage` SET `team` = 'OPERATIONS' WHERE `team` = 'ADMIN';

-- 3. Drop the old value. Order matches prisma/schema.prisma.
ALTER TABLE `Team` MODIFY `code` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL;
ALTER TABLE `Project` MODIFY `currentTeam` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL DEFAULT 'SALES';
ALTER TABLE `ProjectStage` MODIFY `team` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'DISPATCH', 'SERVICE') NOT NULL;
