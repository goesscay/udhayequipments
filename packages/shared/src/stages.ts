import type { TeamCode } from './teams';

export const STAGE_CODES = [
  'LEAD',
  'SITE_SURVEY',
  'QUOTATION_PREP',
  'QUOTATION_SHARED',
  'CUSTOMER_DECISION',
  'BOQ_DRAWING',
  'LAYOUT_APPROVAL',
  'CAD_DRAWING',
  'HEAD_APPROVAL',
  'PRODUCTION',
  'DISPATCH',
  'INSTALLATION',
  'HANDOVER',
  'SERVICE',
] as const;

export type StageCode = (typeof STAGE_CODES)[number];

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
  { code: 'SITE_SURVEY', label: 'Site Survey & Measurement', short: 'Survey', team: 'PROJECT', slaHours: 72 },
  { code: 'QUOTATION_PREP', label: 'Quotation Preparation', short: 'Quotation', team: 'OPERATIONS', slaHours: 48 },
  { code: 'QUOTATION_SHARED', label: 'Quotation Shared', short: 'Shared', team: 'SALES', slaHours: 24 },
  { code: 'CUSTOMER_DECISION', label: 'Customer Decision', short: 'Decision', team: 'SALES', slaHours: 168 },
  { code: 'BOQ_DRAWING', label: 'BOQ & Soft Drawing', short: 'BOQ', team: 'OPERATIONS', slaHours: 72 },
  { code: 'LAYOUT_APPROVAL', label: 'Customer Layout Approval', short: 'Layout OK', team: 'PROJECT', slaHours: 96 },
  { code: 'CAD_DRAWING', label: 'CAD Drawing', short: 'CAD', team: 'CAD', slaHours: 96 },
  { code: 'HEAD_APPROVAL', label: 'Head Approval', short: 'Approval', team: 'MANAGEMENT', slaHours: 24 },
  { code: 'PRODUCTION', label: 'Production & QC', short: 'Production', team: 'PRODUCTION', slaHours: 480 },
  { code: 'DISPATCH', label: 'Dispatch & Delivery', short: 'Dispatch', team: 'DISPATCH', slaHours: 72 },
  { code: 'INSTALLATION', label: 'Installation', short: 'Install', team: 'PROJECT', slaHours: 120 },
  { code: 'HANDOVER', label: 'Handover', short: 'Handover', team: 'PROJECT', slaHours: 48 },
  { code: 'SERVICE', label: 'Service & Support', short: 'Service', team: 'SERVICE', slaHours: 8760 },
];

export const STAGE_BY_CODE = Object.fromEntries(STAGES.map((s) => [s.code, s])) as Record<
  StageCode,
  StageDef
>;

export const stageIndex = (code: StageCode): number => STAGE_CODES.indexOf(code);

export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'LOST', 'COMPLETED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];
