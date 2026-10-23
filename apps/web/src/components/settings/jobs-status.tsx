'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';

interface JobRow {
  name: string;
  lockedUntil: string;
  lastRunAt: string | null;
  lastResult: unknown;
  lastError: string | null;
}

const LABELS: Record<string, { title: string; detail: string }> = {
  'sla-check': { title: 'Deadline alerts', detail: 'Checks open stages and sends due-soon, overdue and escalation alerts.' },
  'notification-cleanup': { title: 'Notification cleanup', detail: 'Deletes read notifications past the retention period.' },
};

export function JobsStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs-status'],
    queryFn: () => api<JobRow[]>('/jobs/status'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.length) {
    return (
      <Card>
        <EmptyState title="No jobs have run yet" hint="They start about 10 seconds after the app boots." />
      </Card>
    );
  }

  return (
    <Card className="divide-y overflow-hidden">
      {data.map((j) => {
        const label = LABELS[j.name] ?? { title: j.name, detail: '' };
        const running = new Date(j.lockedUntil) > new Date();
        return (
          <div key={j.name} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium">{label.title}</p>
              {running ? (
                <Badge tone="blue">running</Badge>
              ) : j.lastError ? (
                <Badge tone="red">last run failed</Badge>
              ) : (
                <Badge tone="green">ok</Badge>
              )}
            </div>
            {label.detail && <p className="text-[12px] text-muted">{label.detail}</p>}
            <p className="mt-1.5 text-[12px]">
              Last run:{' '}
              {j.lastRunAt ? (
                <span title={formatDate(j.lastRunAt, true)}>{timeAgo(j.lastRunAt)}</span>
              ) : (
                <span className="text-muted">never</span>
              )}
            </p>
            {j.lastError ? (
              <p className="mt-1 rounded-md bg-bad/5 px-2 py-1 font-mono text-[11px] text-bad">{j.lastError}</p>
            ) : j.lastResult != null ? (
              <p className="mt-1 font-mono text-[11px] text-muted">{JSON.stringify(j.lastResult)}</p>
            ) : null}
          </div>
        );
      })}
    </Card>
  );
}
