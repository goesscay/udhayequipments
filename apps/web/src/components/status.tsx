import {
  STAGE_BY_CODE,
  type Priority,
  type ProjectStatus,
  type StageCode,
} from '@udhay/shared';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { cn, dueLabel, ragStatus, type Rag } from '@/lib/utils';

const ragDot: Record<Rag, string> = {
  green: 'bg-ok',
  amber: 'bg-warn',
  red: 'bg-bad',
  none: 'bg-line',
};

export function RagDot({ rag, className }: { rag: Rag; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', ragDot[rag], className)} />;
}

export function DueBadge({ startedAt, dueAt }: { startedAt: string | null; dueAt: string | null }) {
  const rag = ragStatus(startedAt, dueAt);
  if (rag === 'none') return null;
  const tone: BadgeTone = rag === 'red' ? 'red' : rag === 'amber' ? 'amber' : 'green';
  return (
    <Badge tone={tone}>
      <RagDot rag={rag} className="size-1.5" />
      {dueLabel(dueAt)}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: StageCode }) {
  return <Badge tone="brand">{STAGE_BY_CODE[stage].short}</Badge>;
}

const statusTone: Record<ProjectStatus, BadgeTone> = {
  ACTIVE: 'blue',
  ON_HOLD: 'amber',
  LOST: 'neutral',
  COMPLETED: 'green',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === 'ACTIVE') return null;
  return <Badge tone={statusTone[status]}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NORMAL' || priority === 'LOW') return null;
  return <Badge tone={priority === 'URGENT' ? 'red' : 'amber'}>{priority.toLowerCase()}</Badge>;
}
