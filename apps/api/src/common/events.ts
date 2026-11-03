import type { StageCode, WorkflowAction } from '@udhay/shared';

/** Domain events, emitted only after the database transaction has committed. */
export const ProjectEvents = {
  TRANSITIONED: 'project.transitioned',
  ASSIGNED: 'project.assigned',
  ACCEPTED: 'project.accepted',
  MENTIONED: 'project.mentioned',
  PAYMENT_RECEIVED: 'project.payment_received',
} as const;

export const TicketEvents = {
  CREATED: 'ticket.created',
  ASSIGNED: 'ticket.assigned',
} as const;

export interface ProjectTransitionedEvent {
  projectId: string;
  actorId: string;
  /** A workflow action, or a Super Admin override (MOVE: jumped to a stage; REASSIGN: handed to another team). */
  action: WorkflowAction | 'MOVE' | 'REASSIGN';
  from: StageCode;
  to: StageCode | null;
  outcome: 'LOST' | 'COMPLETED' | null;
  backwards: boolean;
  reason: string | null;
}

export interface ProjectAssignedEvent {
  projectId: string;
  actorId: string;
  assigneeId: string;
  stage: StageCode;
}

export interface ProjectAcceptedEvent {
  projectId: string;
  actorId: string;
  stage: StageCode;
}

export interface ProjectMentionedEvent {
  projectId: string;
  actorId: string;
  userIds: string[];
  excerpt: string;
}

export interface PaymentReceivedEvent {
  projectId: string;
  actorId: string;
  label: string;
  amount: number;
}

export interface TicketEvent {
  ticketId: string;
  actorId: string;
}
