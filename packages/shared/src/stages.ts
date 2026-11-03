import type { TeamCode } from './teams';

export const STAGE_CODES = [
  'LEAD',
  'LAYOUT_DRAWING',
  'LAYOUT_APPROVAL',
  'QUOTATION_PREP',
  'CUSTOMER_DECISION',
  'BOQ_DRAWING',
  'SITE_SURVEY',
  'CAD_DRAWING',
  'HEAD_APPROVAL',
  'CAD_RELEASE',
  'PRODUCTION',
  'QC',
  'DISPATCH',
  'INSTALLATION',
  'SERVICE',
] as const;

/** The 15 stages the app ships with. Settings → Workflow can add more (codes starting with "X_"). */
export type BuiltinStageCode = (typeof STAGE_CODES)[number];
/** Any stage code: built-in or added in Settings → Workflow. */
export type StageCode = string;

export interface StageDef {
  code: StageCode;
  label: string;
  short: string;
  team: TeamCode;
  /** Default SLA; overridable per stage in the stage_settings table. */
  slaHours: number;
}

export const STAGES: readonly StageDef[] = [
  { code: 'LEAD', label: 'Lead & Requirement', short: 'Lead', team: 'SALES', slaHours: 72 },
  { code: 'LAYOUT_DRAWING', label: 'Layout Drawing', short: 'Layout', team: 'CAD', slaHours: 72 },
  { code: 'LAYOUT_APPROVAL', label: 'Customer Approval - Layout', short: 'Layout OK', team: 'SALES', slaHours: 96 },
  { code: 'QUOTATION_PREP', label: 'Quotation Preparation', short: 'Quotation', team: 'OPERATIONS', slaHours: 48 },
  { code: 'CUSTOMER_DECISION', label: 'Customer Approval - Quotation & PO', short: 'Quote & PO', team: 'SALES', slaHours: 168 },
  { code: 'BOQ_DRAWING', label: 'BOQ & Soft Drawing', short: 'BOQ', team: 'OPERATIONS', slaHours: 72 },
  { code: 'SITE_SURVEY', label: 'Site Survey & Measurement', short: 'Survey', team: 'PROJECT', slaHours: 72 },
  { code: 'CAD_DRAWING', label: 'MEP Layout', short: 'MEP', team: 'CAD', slaHours: 96 },
  { code: 'HEAD_APPROVAL', label: 'MEP Layout Approval', short: 'MEP OK', team: 'MANAGEMENT', slaHours: 24 },
  { code: 'CAD_RELEASE', label: 'MEP Layout - Release to Production', short: 'Release', team: 'CAD', slaHours: 24 },
  { code: 'PRODUCTION', label: 'Production', short: 'Production', team: 'PRODUCTION', slaHours: 480 },
  { code: 'QC', label: 'Quality Check (QC)', short: 'QC', team: 'QC', slaHours: 48 },
  { code: 'DISPATCH', label: 'Dispatch & Delivery', short: 'Dispatch', team: 'DISPATCH', slaHours: 72 },
  { code: 'INSTALLATION', label: 'Installation & Handover', short: 'Install', team: 'PROJECT', slaHours: 168 },
  { code: 'SERVICE', label: 'Service & Support', short: 'Service', team: 'SERVICE', slaHours: 8760 },
];

/** Stages earlier versions had, since merged into another stage. Old history still shows these names. */
export const RETIRED_STAGES: Record<string, { label: string; short: string; mergedInto: BuiltinStageCode }> = {
  QUOTATION_SHARED: { label: 'Quotation Shared', short: 'Shared', mergedInto: 'CUSTOMER_DECISION' },
  HANDOVER: { label: 'Handover', short: 'Handover', mergedInto: 'INSTALLATION' },
};

export const STAGE_BY_CODE = Object.fromEntries(STAGES.map((s) => [s.code, s])) as Record<
  StageCode,
  StageDef
>;

/** Position in the built-in order (-1 for added stages). For the configured order use the workflow's index(). */
export const stageIndex = (code: StageCode): number => STAGE_CODES.indexOf(code as BuiltinStageCode);

export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'LOST', 'COMPLETED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];
