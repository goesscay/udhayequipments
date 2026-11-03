-- Workflow rebuilt to match the company's process sheet (UdhayEquipmentProcess.xlsx):
-- layout drawing and approval come first, site survey moves after BOQ, MEP layout is approved by
-- Admin and released by CAD, QC becomes its own stage and department, and Installation & Handover
-- is one stage. Production items now move through four levels.

-- New department, document types and production levels
ALTER TABLE `Team` MODIFY `code` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE') NOT NULL;
ALTER TABLE `Project` MODIFY `currentTeam` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE') NOT NULL DEFAULT 'SALES';
ALTER TABLE `ProjectStage` MODIFY `team` ENUM('MANAGEMENT', 'SALES', 'PROJECT', 'OPERATIONS', 'CAD', 'PRODUCTION', 'QC', 'DISPATCH', 'SERVICE') NOT NULL;
ALTER TABLE `Document` MODIFY `type` ENUM('REQUIREMENT', 'LAYOUT', 'MEASUREMENT', 'SITE_PHOTO', 'QUOTATION', 'PURCHASE_ORDER', 'BOQ', 'SOFT_DRAWING', 'CUSTOMER_APPROVAL', 'CAD', 'QC_REPORT', 'DELIVERY_CHALLAN', 'POD', 'INSTALLATION_PHOTO', 'HANDOVER_CERT', 'SERVICE_PHOTO', 'OTHER') NOT NULL;
ALTER TABLE `ProductionItem` ADD COLUMN `level` ENUM('LASER_BENDING', 'FABRICATION', 'WELDING', 'POLISH') NULL;

-- Items already being made get the level matching their progress; finished ones are past Polish.
UPDATE `ProductionItem` SET `level` = 'POLISH', `progress` = 100 WHERE `status` = 'DONE';
UPDATE `ProductionItem`
SET `level` = CASE
    WHEN `progress` < 25 THEN 'LASER_BENDING'
    WHEN `progress` < 50 THEN 'FABRICATION'
    WHEN `progress` < 75 THEN 'WELDING'
    ELSE 'POLISH'
  END
WHERE `status` = 'IN_PROGRESS';
UPDATE `ProductionItem`
SET `progress` = CASE `level` WHEN 'LASER_BENDING' THEN 12 WHEN 'FABRICATION' THEN 37 WHEN 'WELDING' THEN 62 ELSE 87 END
WHERE `status` = 'IN_PROGRESS';

-- Projects sitting in a stage that moved or merged go to where that work now happens.
-- Order matters: early-stage surveys move first, then the old (post-BOQ) layout approvals take their place.

-- Site survey used to come before the quotation; without a BOQ yet, the next step is now the layout drawing.
UPDATE `Project` p
SET p.`currentStage` = 'LAYOUT_DRAWING', p.`currentTeam` = 'CAD'
WHERE p.`currentStage` = 'SITE_SURVEY'
  AND NOT EXISTS (SELECT 1 FROM `ProjectStage` b WHERE b.`projectId` = p.`id` AND b.`stage` = 'BOQ_DRAWING');
UPDATE `ProjectStage` ps JOIN `Project` p ON p.`id` = ps.`projectId`
SET ps.`stage` = 'LAYOUT_DRAWING', ps.`team` = 'CAD'
WHERE ps.`status` = 'OPEN' AND ps.`stage` = 'SITE_SURVEY' AND p.`currentStage` = 'LAYOUT_DRAWING';

-- Layout approval used to follow the BOQ; after the BOQ the Project team now does the site survey.
UPDATE `ProjectStage` SET `stage` = 'SITE_SURVEY', `team` = 'PROJECT' WHERE `status` = 'OPEN' AND `stage` = 'LAYOUT_APPROVAL';
UPDATE `Project` SET `currentStage` = 'SITE_SURVEY', `currentTeam` = 'PROJECT' WHERE `currentStage` = 'LAYOUT_APPROVAL';

-- Quotation Shared merged into Customer Approval - Quotation & PO; Handover into Installation & Handover.
UPDATE `ProjectStage` SET `stage` = 'CUSTOMER_DECISION', `team` = 'SALES' WHERE `status` = 'OPEN' AND `stage` = 'QUOTATION_SHARED';
UPDATE `Project` SET `currentStage` = 'CUSTOMER_DECISION', `currentTeam` = 'SALES' WHERE `currentStage` = 'QUOTATION_SHARED';
UPDATE `ProjectStage` SET `stage` = 'INSTALLATION', `team` = 'PROJECT' WHERE `status` = 'OPEN' AND `stage` = 'HANDOVER';
UPDATE `Project` SET `currentStage` = 'INSTALLATION', `currentTeam` = 'PROJECT' WHERE `currentStage` = 'HANDOVER';

DELETE FROM `StageSetting` WHERE `stage` IN ('QUOTATION_SHARED', 'HANDOVER');
-- The new Installation & Handover stage covers both visits; give it the longer default.
UPDATE `StageSetting` SET `slaHours` = 168 WHERE `stage` = 'INSTALLATION' AND `slaHours` = 120;

-- Workflow settings were made for the old stage order. Keep a copy, then start from the new
-- built-in workflow, keeping only stages the company added itself.
INSERT INTO `AppSetting` (`key`, `value`, `updatedAt`)
SELECT 'workflow.beforeProcessSheet', `value`, NOW(3) FROM `AppSetting` WHERE `key` = 'workflow'
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updatedAt` = NOW(3);
UPDATE `AppSetting`
SET `value` = JSON_REMOVE(`value`, '$.order', '$.stages', '$.transitions'), `updatedAt` = NOW(3)
WHERE `key` = 'workflow' AND JSON_VALID(`value`);
