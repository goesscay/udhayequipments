import type { StageCode, WorkflowAction } from '@udhay/shared';

/** Domain events, emitted only after the database transaction has committed. */
export const ProjectEvents = {
  TRANSITIONED: 'project.transitioned',
  ASSIGNED: 'project.assigned',
} as const;

export interface ProjectTransitionedEvent {
  projectId: string;
  actorId: string;
  action: WorkflowAction;
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
