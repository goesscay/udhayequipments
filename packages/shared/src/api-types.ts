import type { DocumentType } from './documents';
import type { PermissionKey, RoleCode, Scope } from './permissions';
import type { Priority, ProjectStatus, StageCode } from './stages';
import type { TeamCode } from './teams';
import type { WorkflowAction } from './workflow';

/** Response shapes shared by the API and the web app. */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: { code: RoleCode | string; name: string };
  team: { id: string; code: TeamCode; name: string } | null;
  permissions: Partial<Record<PermissionKey, Scope>>;
}

export interface AuthResponse {
  accessToken: string;
  user: SessionUser;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface ProjectListItem {
  id: string;
  code: string;
  title: string;
  customer: { id: string; name: string };
  city: string | null;
  status: ProjectStatus;
  priority: Priority;
  currentStage: StageCode;
  currentTeam: TeamCode;
  stageDueAt: string | null;
  stageStartedAt: string | null;
  assignee: UserRef | null;
  accepted: boolean;
  salesOwner: UserRef;
  /** null when the viewer lacks price.view */
  estimatedValue: number | null;
  updatedAt: string;
}

export interface AvailableAction {
  action: WorkflowAction;
  label: string;
  tone: 'primary' | 'neutral' | 'danger';
  reasonRequired: boolean;
  missingDocuments: DocumentType[];
  /** Business rules not yet met, e.g. "Advance payment not received". */
  blockers: string[];
}

export interface ProjectDetail extends ProjectListItem {
  siteAddress: string | null;
  requirement: string | null;
  holdReason: string | null;
  createdAt: string;
  customerContact: { contactPerson: string | null; phone: string; email: string | null };
  stages: {
    id: string;
    stage: StageCode;
    team: TeamCode;
    cycle: number;
    status: 'OPEN' | 'DONE' | 'RETURNED';
    assignee: UserRef | null;
    startedAt: string;
    acceptedAt: string | null;
    dueAt: string | null;
    completedAt: string | null;
  }[];
  timeline: {
    id: string;
    action: string;
    fromStage: StageCode | null;
    toStage: StageCode | null;
    reason: string | null;
    by: UserRef;
    createdAt: string;
  }[];
  documents: {
    id: string;
    type: DocumentType;
    stage: StageCode;
    version: number;
    fileName: string;
    sizeBytes: number;
    uploadedBy: UserRef;
    createdAt: string;
  }[];
  comments: { id: string; body: string; author: UserRef; createdAt: string }[];
  availableActions: AvailableAction[];
  canAccept: boolean;
  canAssign: boolean;
  canManage: boolean;
}

export interface QueueItem {
  stageId: string;
  project: { id: string; code: string; title: string; customerName: string; city: string | null; priority: Priority };
  stage: StageCode;
  cycle: number;
  assignee: UserRef | null;
  accepted: boolean;
  startedAt: string;
  dueAt: string | null;
}

export interface DashboardSummary {
  kpis: {
    activeProjects: number;
    pipelineValue: number | null;
    awaitingCustomer: number;
    overdue: number;
    inProduction: number;
    inDispatch: number;
    onHold: number;
    pendingAcceptance: number;
    wonThisMonth: number;
    lostThisMonth: number;
    /** null when the viewer lacks price.view */
    outstandingPayments: number | null;
    /** null when the viewer lacks service.view */
    openTickets: number | null;
    dispatchesNext7Days: number;
  };
  stageCounts: { stage: StageCode; count: number; overdue: number }[];
  teamWorkload: { team: TeamCode; active: number; overdue: number }[];
  overdueProjects: ProjectListItem[];
  recentActivity: {
    id: string;
    projectId: string;
    projectCode: string;
    action: string;
    fromStage: StageCode | null;
    toStage: StageCode | null;
    by: string;
    createdAt: string;
  }[];
}

export const NOTIFICATION_TYPES = [
  'HANDOFF',
  'RETURNED',
  'ASSIGNED',
  'CLOSED',
  'SLA_DUE_SOON',
  'SLA_OVERDUE',
  'SLA_ESCALATED',
  'MENTION',
  'HANDOFF_ACCEPTED',
  'PAYMENT_RECEIVED',
  'TICKET_CREATED',
  'TICKET_ASSIGNED',
  'TICKET_OVERDUE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  projectId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unread: number;
  nextCursor: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
