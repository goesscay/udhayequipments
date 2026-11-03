-- Accounts and Purchase become teams, and the generic roles (Overall Head, Team Head, Team Member,
-- Viewer) are replaced by one role per department (Sales, CAD, Project, Service, ...).

ALTER TABLE `Team` MODIFY `code` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE', 'ACCOUNTS', 'PURCHASE') NOT NULL;
ALTER TABLE `Project` MODIFY `currentTeam` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE', 'ACCOUNTS', 'PURCHASE') NOT NULL DEFAULT 'SALES';
ALTER TABLE `ProjectStage` MODIFY `team` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE', 'ACCOUNTS', 'PURCHASE') NOT NULL;

-- Anyone still on a retired role (including deleted users, who keep their row) moves to the role
-- named after their team; anyone left over gets the read-only Purchase role.
UPDATE `User` u
JOIN `Role` old ON old.`id` = u.`roleId`
JOIN `Team` t ON t.`id` = u.`teamId`
JOIN `Role` nr ON nr.`code` = t.`code`
SET u.`roleId` = nr.`id`
WHERE old.`code` IN ('DIRECTOR', 'TEAM_HEAD', 'TEAM_MEMBER', 'VIEWER');

UPDATE `User` u
JOIN `Role` old ON old.`id` = u.`roleId`
JOIN `Role` nr ON nr.`code` = 'PURCHASE'
SET u.`roleId` = nr.`id`
WHERE old.`code` IN ('DIRECTOR', 'TEAM_HEAD', 'TEAM_MEMBER', 'VIEWER');

-- Their permissions go with them (cascade).
DELETE r FROM `Role` r
WHERE r.`code` IN ('DIRECTOR', 'TEAM_HEAD', 'TEAM_MEMBER', 'VIEWER')
  AND NOT EXISTS (SELECT 1 FROM `User` u WHERE u.`roleId` = r.`id`);
