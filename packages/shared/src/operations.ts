import type { Priority, ProjectStatus, StageCode } from './stages';
import type { UserRef } from './api-types';

/** Phase 2: payments, production, dispatch, installation, service and reports. */

export const PAYMENT_KINDS = ['ADVANCE', 'PRE_DISPATCH', 'FINAL', 'OTHER'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  ADVANCE: 'Advance',
  PRE_DISPATCH: 'Before dispatch',
  FINAL: 'Final',
  OTHER: 'Other',
};

export const PAYMENT_STATUSES = ['PENDING', 'RECEIVED', 'WAIVED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_MODES = ['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Card', 'Other'] as const;

export const ITEM_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** The four levels every production item goes through, in order. */
export const PRODUCTION_LEVELS = ['LASER_BENDING', 'FABRICATION', 'WELDING', 'POLISH'] as const;
export type ProductionLevel = (typeof PRODUCTION_LEVELS)[number];
export const PRODUCTION_LEVEL_LABELS: Record<ProductionLevel, string> = {
  LASER_BENDING: 'Laser & Bending',
  FABRICATION: 'Fabrication',
  WELDING: 'Welding',
  POLISH: 'Polish',
};

/** Item progress: each level is a quarter; an item at a level is part-way through it. */
export function itemProgress(status: ItemStatus, level: ProductionLevel | null): number {
  if (status === 'DONE') return 100;
  if (status === 'NOT_STARTED' || !level) return 0;
  return PRODUCTION_LEVELS.indexOf(level) * 25 + 12;
}

export const QC_STATUSES = ['PENDING', 'PASSED', 'FAILED'] as const;
export type QcStatus = (typeof QC_STATUSES)[number];

export const TRIP_STATUSES = ['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const SNAG_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type SnagStatus = (typeof SNAG_STATUSES)[number];

export const TICKET_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const OPEN_TICKET_STATUSES: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

/** Editable business rules (Settings → Rules). */
export interface AppRules {
  /** Block "Approve, release to Production" until the advance is received or waived. */
  advanceBeforeProduction: boolean;
  /** Block dispatching a trip until the before-dispatch payment is received or waived. */
  preDispatchBeforeDispatch: boolean;
  defaultWarrantyMonths: number;
  /** Target response time for service tickets, by priority. */
  ticketSlaHours: Record<Priority, number>;
}

export const DEFAULT_RULES: AppRules = {
  advanceBeforeProduction: false,
  preDispatchBeforeDispatch: false,
  defaultWarrantyMonths: 12,
  ticketSlaHours: { URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 168 },
};

// ── Response shapes ─────────────────────────────────────────────────

export interface PaymentMilestoneItem {
  id: string;
  kind: PaymentKind;
  label: string;
  amount: number;
  dueDate: string | null;
  status: PaymentStatus;
  receivedAt: string | null;
  receivedAmount: number | null;
  mode: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: UserRef | null;
}

export interface PaymentSummary {
  milestones: PaymentMilestoneItem[];
  totalPlanned: number;
  totalReceived: number;
  outstanding: number;
  canManage: boolean;
}

export interface ProductionItemRow {
  id: string;
  name: string;
  quantity: number;
  spec: string | null;
  status: ItemStatus;
  /** Level being worked on while in progress (Polish once done); null before work starts. */
  level: ProductionLevel | null;
  progress: number;
  qcStatus: QcStatus;
  qcNotes: string | null;
  qcBy: UserRef | null;
  qcAt: string | null;
}

export interface ProductionSummary {
  items: ProductionItemRow[];
  /** Weighted by quantity, 0–100. */
  progress: number;
  /** How many items are not started, at each level, or done. */
  counts: Record<'NOT_STARTED' | ProductionLevel | 'DONE', number>;
  /** Every item has been through all four levels. */
  readyForQc: boolean;
  readyForDispatch: boolean;
  /** Production team: add items and move them through the levels. */
  canManage: boolean;
  /** QC team, while the project is at the QC stage: pass or fail items. */
  canQc: boolean;
}

export interface DispatchTripRow {
  id: string;
  tripNo: number;
  plannedDate: string;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  challanNo: string | null;
  ewayBillNo: string | null;
  itemsNote: string | null;
  status: TripStatus;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedByName: string | null;
  podDocumentId: string | null;
}

export interface DispatchBoardTrip extends DispatchTripRow {
  project: { id: string; code: string; title: string; customerName: string; city: string | null; siteAddress: string | null };
}

export interface SnagRow {
  id: string;
  title: string;
  description: string | null;
  status: SnagStatus;
  resolution: string | null;
  raisedBy: UserRef;
  resolvedBy: UserRef | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface HandoverInfo {
  signedByName: string;
  signedByPhone: string | null;
  signedAt: string;
  warrantyMonths: number;
  warrantyStart: string;
  warrantyEnd: string;
  trainingDone: boolean;
  notes: string | null;
  certificateDocumentId: string | null;
  recordedBy: UserRef;
}

export interface SiteSummary {
  snags: SnagRow[];
  openSnags: number;
  handover: HandoverInfo | null;
  canManage: boolean;
  defaultWarrantyMonths: number;
}

export interface TicketListItem {
  id: string;
  code: string;
  title: string;
  priority: Priority;
  status: TicketStatus;
  underWarranty: boolean;
  dueAt: string | null;
  createdAt: string;
  assignee: UserRef | null;
  project: { id: string; code: string; customerName: string; city: string | null };
}

export interface TicketDetail extends TicketListItem {
  description: string;
  contactName: string | null;
  contactPhone: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  csatRating: number | null;
  csatComment: string | null;
  raisedBy: UserRef;
  warrantyEnd: string | null;
  visits: { id: string; visitDate: string; workDone: string; partsUsed: string | null; technician: UserRef }[];
  canManage: boolean;
}

export interface ReportSummary {
  range: { from: string; to: string };
  stageDurations: {
    stage: StageCode;
    completed: number;
    avgHours: number | null;
    medianHours: number | null;
    overSlaPct: number | null;
  }[];
  quotation: { accepted: number; lost: number; revisions: number; winRatePct: number | null };
  lostReasons: { projectId: string; projectCode: string; customerName: string; reason: string | null; date: string }[];
  monthly: { month: string; created: number; won: number; wonValue: number | null; collected: number | null }[];
  service: {
    opened: number;
    resolved: number;
    avgResolutionHours: number | null;
    avgCsat: number | null;
    underWarrantyPct: number | null;
  };
  projectsByStatus: { status: ProjectStatus; count: number }[];
}
