'use client';

import { useQuery } from '@tanstack/react-query';
import { STAGE_BY_CODE, type QueueItem } from '@udhay/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { DueBadge, PriorityBadge, StageBadge } from '@/components/status';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';

export default function QueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: () => api<QueueItem[]>('/projects/queue'),
    refetchInterval: 60_000,
  });

  const waiting = data?.filter((q) => !q.accepted) ?? [];
  const working = data?.filter((q) => q.accepted) ?? [];

  return (
    <>
      <PageHeader title="My Queue" subtitle="Work waiting on you and your team" />
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState title="You're all caught up" hint="New handoffs to your team will appear here." />
        </Card>
      ) : (
        <div className="space-y-6">
          {waiting.length > 0 && <Section title="New handoffs to accept" items={waiting} />}
          {working.length > 0 && <Section title="In progress" items={working} />}
        </div>
      )}
    </>
  );
}

function Section({ title, items }: { title: string; items: QueueItem[] }) {
  return (
    <section>
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {title} <span className="tabular">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map((q) => (
          <Link key={q.stageId} href={`/projects/${q.project.id}`}>
            <Card className="flex items-center gap-3 p-3.5 transition-colors hover:border-brand/30">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-muted">{q.project.code}</span>
                  <StageBadge stage={q.stage} />
                  {q.cycle > 1 && <Badge tone="amber">revision {q.cycle - 1}</Badge>}
                  <PriorityBadge priority={q.project.priority} />
                </div>
                <p className="mt-1 truncate font-medium">{q.project.customerName}</p>
                <p className="truncate text-[12px] text-muted">
                  {STAGE_BY_CODE[q.stage].label}
                  {q.project.city ? ` · ${q.project.city}` : ''}
                  {q.assignee ? ` · ${q.assignee.name}` : ' · Unassigned'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <DueBadge startedAt={q.startedAt} dueAt={q.dueAt} />
                <ChevronRight className="size-4 text-muted" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
