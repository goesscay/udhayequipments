-- Stages become configurable (Settings → Workflow can add new ones), so stage columns change from a
-- fixed ENUM to text. Existing values ('LEAD', 'SITE_SURVEY', ...) are kept exactly as they are.
ALTER TABLE `Project` MODIFY `currentStage` VARCHAR(40) NOT NULL DEFAULT 'LEAD';
ALTER TABLE `ProjectStage` MODIFY `stage` VARCHAR(40) NOT NULL;
ALTER TABLE `StageTransition` MODIFY `fromStage` VARCHAR(40) NULL;
ALTER TABLE `StageTransition` MODIFY `toStage` VARCHAR(40) NULL;
ALTER TABLE `Document` MODIFY `stage` VARCHAR(40) NOT NULL;
ALTER TABLE `Comment` MODIFY `stage` VARCHAR(40) NULL;
ALTER TABLE `StageSetting` MODIFY `stage` VARCHAR(40) NOT NULL;
