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
  { from: 'LEAD', action: 'SUBMIT', label: 'Send requirement to CAD for layout', to: 'LAYOUT_DRAWING', permission: act, teamBound: true, tone: 'primary' },
  { from: 'LEAD', action: 'MARK_LOST', label: 'Mark lost', to: null, outcome: 'LOST', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'LAYOUT_DRAWING', action: 'SUBMIT', label: 'Send layout to Sales', to: 'LAYOUT_APPROVAL', permission: act, teamBound: true, requiresDocuments: ['LAYOUT'], tone: 'primary' },

  { from: 'LAYOUT_APPROVAL', action: 'APPROVE', label: 'Customer approved layout, send to Operations', to: 'QUOTATION_PREP', permission: act, teamBound: true, tone: 'primary' },
  { from: 'LAYOUT_APPROVAL', action: 'REQUEST_REVISION', label: 'Revise layout', to: 'LAYOUT_DRAWING', permission: act, teamBound: true, reasonRequired: true, tone: 'neutral' },
  { from: 'LAYOUT_APPROVAL', action: 'MARK_LOST', label: 'Mark lost', to: null, outcome: 'LOST', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'QUOTATION_PREP', action: 'SUBMIT', label: 'Send quotation to Sales', to: 'CUSTOMER_DECISION', permission: act, teamBound: true, requiresDocuments: ['QUOTATION'], tone: 'primary' },

  { from: 'CUSTOMER_DECISION', action: 'ACCEPT', label: 'Quotation & PO approved, send to Operations', to: 'BOQ_DRAWING', permission: act, teamBound: true, requiresDocuments: ['PURCHASE_ORDER'], tone: 'primary' },
  { from: 'CUSTOMER_DECISION', action: 'REQUEST_REVISION', label: 'Revise quotation', to: 'QUOTATION_PREP', permission: act, teamBound: true, reasonRequired: true, tone: 'neutral' },
  { from: 'CUSTOMER_DECISION', action: 'MARK_LOST', label: 'Mark lost', to: null, outcome: 'LOST', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'BOQ_DRAWING', action: 'SUBMIT', label: 'Send BOQ & soft drawing to Project', to: 'SITE_SURVEY', permission: act, teamBound: true, requiresDocuments: ['BOQ', 'SOFT_DRAWING'], tone: 'primary' },

  { from: 'SITE_SURVEY', action: 'SUBMIT', label: 'Send measurements to CAD for MEP layout', to: 'CAD_DRAWING', permission: act, teamBound: true, requiresDocuments: ['MEASUREMENT'], tone: 'primary' },
  { from: 'SITE_SURVEY', action: 'REQUEST_REVISION', label: 'Revise BOQ / soft drawing', to: 'BOQ_DRAWING', permission: act, teamBound: true, reasonRequired: true, tone: 'neutral' },

  { from: 'CAD_DRAWING', action: 'SUBMIT', label: 'Send MEP layout to Admin for review', to: 'HEAD_APPROVAL', permission: act, teamBound: true, requiresDocuments: ['CAD'], tone: 'primary' },

  { from: 'HEAD_APPROVAL', action: 'APPROVE', label: 'Approve, back to CAD to release', to: 'CAD_RELEASE', permission: 'cad.approve', teamBound: false, tone: 'primary' },
  { from: 'HEAD_APPROVAL', action: 'REJECT', label: 'Reject, back to CAD', to: 'CAD_DRAWING', permission: 'cad.approve', teamBound: false, reasonRequired: true, tone: 'danger' },

  { from: 'CAD_RELEASE', action: 'SUBMIT', label: 'Release to Production', to: 'PRODUCTION', permission: act, teamBound: true, tone: 'primary' },

  { from: 'PRODUCTION', action: 'COMPLETE', label: 'Production done, send to QC', to: 'QC', permission: act, teamBound: true, tone: 'primary' },

  { from: 'QC', action: 'APPROVE', label: 'QC passed, send to Dispatch', to: 'DISPATCH', permission: act, teamBound: true, tone: 'primary' },
  { from: 'QC', action: 'REJECT', label: 'Send back to Production', to: 'PRODUCTION', permission: act, teamBound: true, reasonRequired: true, tone: 'danger' },

  { from: 'DISPATCH', action: 'DELIVER', label: 'Delivered, inform Project for installation', to: 'INSTALLATION', permission: act, teamBound: true, requiresDocuments: ['POD'], tone: 'primary' },

  // Needs closed snags and a recorded handover (customer sign-off + warranty); checked by the API's gates.
  { from: 'INSTALLATION', action: 'HANDOVER', label: 'Handed over, start service', to: 'SERVICE', permission: act, teamBound: true, tone: 'primary' },

  { from: 'SERVICE', action: 'CLOSE', label: 'Close project', to: null, outcome: 'COMPLETED', permission: act, teamBound: true, tone: 'neutral' },
];

export const transitionsFrom = (stage: StageCode) => TRANSITIONS.filter((t) => t.from === stage);

export const findTransition = (stage: StageCode, action: WorkflowAction) =>
  TRANSITIONS.find((t) => t.from === stage && t.action === action);
