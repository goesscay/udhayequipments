import { TEAM_LABELS, type ProjectDetail } from '@udhay/shared';
import { Check } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useWorkflow } from '@/lib/workflow';

/** Vertical stepper of the workflow's stages with the latest visit to each. Switched-off stages are left out unless this project went through them. */
export function StageStepper({ project }: { project: ProjectDetail }) {
  const latest = new Map<string, ProjectDetail['stages'][number]>();
  for (const s of project.stages) latest.set(s.stage, s);
  const stages = useWorkflow().stages.filter((s) => s.enabled || latest.has(s.code));
  const currentIdx = stages.findIndex((s) => s.code === project.currentStage);
  const closed = project.status !== 'ACTIVE' && project.status !== 'ON_HOLD';

  return (
    <ol className="relative">
      {stages.map((def, i) => {
        const visit = latest.get(def.code);
        const isCurrent = i === currentIdx && !closed;
        const done = visit?.status === 'DONE' || (i < currentIdx && !!visit);
        const overdue = isCurrent && visit?.dueAt && new Date(visit.dueAt) < new Date();
        return (
          <li key={def.code} className="relative flex gap-3 pb-4 last:pb-0">
            {i < stages.length - 1 && (
              <span className={cn('absolute left-[11px] top-6 h-[calc(100%-16px)] w-px', done ? 'bg-brand' : 'bg-line')} />
            )}
            <span
              className={cn(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-none border text-[10px] font-semibold',
                done && 'border-brand bg-brand text-white',
                isCurrent && !overdue && 'border-brand bg-white text-brand ring-4 ring-brand-50',
                isCurrent && overdue && 'border-bad bg-white text-bad ring-4 ring-bad/10',
                !done && !isCurrent && 'bg-white text-muted',
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn('text-[13px] leading-tight', isCurrent ? 'font-semibold' : done ? 'font-medium' : 'text-muted')}>
                {def.label}
                {visit && visit.cycle > 1 && <span className="ml-1.5 text-[11px] font-normal text-warn">rev {visit.cycle - 1}</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {TEAM_LABELS[def.team]}
                {visit?.assignee && ` · ${visit.assignee.name}`}
                {visit?.completedAt
                  ? ` · ${formatDate(visit.completedAt)}`
                  : isCurrent && visit?.dueAt
                    ? ` · due ${formatDate(visit.dueAt, true)}`
                    : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
