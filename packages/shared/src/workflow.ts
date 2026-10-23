import type { DocumentType } from './documents';
import type { PermissionKey } from './permissions';
import type { StageCode } from './stages';

export const WORKFLOW_ACTIONS = [
  'SUBMIT',
  'MARK_SENT',
  'ACCEPT',
  'REQUEST_REVISION',
  'MARK_LOST',
  'APPROVE',
  'REJECT',
  'COMPLETE',
  'DELIVER',
  'HANDOVER',
  'CLOSE',
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export interface TransitionDef {
  from: StageCode;
  action: WorkflowAction;
  label: string;
  /** Next stage, or null when the action closes the project. */
  to: StageCode | null;
  outcome?: 'LOST' | 'COMPLETED';
  permission: PermissionKey;
  /** When true the actor must belong to the stage's team (unless their scope is ALL). */
  teamBound: boolean;
  requiresDocuments?: DocumentType[];
  reasonRequired?: boolean;
  tone: 'primary' | 'neutral' | 'danger';
}

const act = 'stage.act' as const;

/**
 * The project workflow. Every allowed move between stages is listed here;
 * anything not listed is rejected by the API.
 */
export const TRANSITIONS: readonly TransitionDef[] = [
  { from: 'LEAD', action: 'SUBMIT', label: 'Send to Project team', to: 'SITE_SURVEY', permission: act, teamBound: true, tone: 'primary' },
  { from: 'LEAD', action: 'MARK_LOST', label: 'Mark lost', to: null, outcome: 'LOST', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'SITE_SURVEY', action: 'SUBMIT', label: 'Send measurements to Operations', to: 'QUOTATION_PREP', permission: act, teamBound: true, requiresDocuments: ['MEASUREMENT'], tone: 'primary' },

  { from: 'QUOTATION_PREP', action: 'SUBMIT', label: 'Send quotation to Sales', to: 'QUOTATION_SHARED', permission: act, teamBound: true, requiresDocuments: ['QUOTATION'], tone: 'primary' },

  { from: 'QUOTATION_SHARED', action: 'MARK_SENT', label: 'Shared with customer', to: 'CUSTOMER_DECISION', permission: act, teamBound: true, tone: 'primary' },

  { from: 'CUSTOMER_DECISION', action: 'ACCEPT', label: 'Customer accepted', to: 'BOQ_DRAWING', permission: act, teamBound: true, tone: 'primary' },
  { from: 'CUSTOMER_DECISION', action: 'REQUEST_REVISION', label: 'Revise quotation', to: 'QUOTATION_PREP', permission: act, teamBound: true, reasonRequired: true, tone: 'neutral' },
  { from: 'CUSTOMER_DECISION', action: 'MARK_LOST', label: 'Mark lost', to: null, outcome: 'LOST', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'BOQ_DRAWING', action: 'SUBMIT', label: 'Send BOQ & drawing to Project', to: 'LAYOUT_APPROVAL', permission: act, teamBound: true, requiresDocuments: ['BOQ', 'SOFT_DRAWING'], tone: 'primary' },

  { from: 'LAYOUT_APPROVAL', action: 'APPROVE', label: 'Customer approved, send to CAD', to: 'CAD_DRAWING', permission: act, teamBound: true, tone: 'primary' },
  { from: 'LAYOUT_APPROVAL', action: 'REQUEST_REVISION', label: 'Revise BOQ / drawing', to: 'BOQ_DRAWING', permission: act, teamBound: true, reasonRequired: true, tone: 'neutral' },

  { from: 'CAD_DRAWING', action: 'SUBMIT', label: 'Submit for Head approval', to: 'HEAD_APPROVAL', permission: act, teamBound: true, requiresDocuments: ['CAD'], tone: 'primary' },

  { from: 'HEAD_APPROVAL', action: 'APPROVE', label: 'Approve, release to Production', to: 'PRODUCTION', permission: 'cad.approve', teamBound: false, tone: 'primary' },
  { from: 'HEAD_APPROVAL', action: 'REJECT', label: 'Reject, back to CAD', to: 'CAD_DRAWING', permission: 'cad.approve', teamBound: false, reasonRequired: true, tone: 'danger' },

  { from: 'PRODUCTION', action: 'COMPLETE', label: 'Production & QC done', to: 'DISPATCH', permission: act, teamBound: true, tone: 'primary' },

  { from: 'DISPATCH', action: 'DELIVER', label: 'Delivered to site', to: 'INSTALLATION', permission: act, teamBound: true, requiresDocuments: ['POD'], tone: 'primary' },

  { from: 'INSTALLATION', action: 'COMPLETE', label: 'Installation complete', to: 'HANDOVER', permission: act, teamBound: true, tone: 'primary' },

  // Needs a recorded handover (customer signature + warranty); checked by the API's gates.
  { from: 'HANDOVER', action: 'HANDOVER', label: 'Handed over, start service', to: 'SERVICE', permission: act, teamBound: true, tone: 'primary' },

  { from: 'SERVICE', action: 'CLOSE', label: 'Close project', to: null, outcome: 'COMPLETED', permission: act, teamBound: true, tone: 'neutral' },
];

export const transitionsFrom = (stage: StageCode) => TRANSITIONS.filter((t) => t.from === stage);

export const findTransition = (stage: StageCode, action: WorkflowAction) =>
  TRANSITIONS.find((t) => t.from === stage && t.action === action);
