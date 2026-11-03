'use client';

import { useQuery } from '@tanstack/react-query';
import { type QueueItem, type TicketListItem } from '@udhay/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { TicketRows } from '@/components/service/tickets';
import { DueBadge, PriorityBadge, StageBadge, StageName } from '@/components/status';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function QueuePage() {
  const { user } = useAuth();
  const isService = !!user?.permissions['service.manage'] && user.team?.code === 'SERVICE';
  const tickets = useQuery({
    queryKey: ['tickets', 'mine'],
    queryFn: () => api<TicketListItem[]>('/service/tickets?status=OPEN_ANY&mine=true'),
    enabled: isService,
    refetchInterval: 60_000,
  });
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
      ) : !data?.length && !tickets.data?.length ? (
        <Card>
          <EmptyState title="You're all caught up" hint="New handoffs to your team will appear here." />
        </Card>
      ) : (
        <div className="space-y-6">
          {!!tickets.data?.length && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                My service tickets <span className="tabular">({tickets.data.length})</span>
              </h2>
              <Card className="overflow-hidden">
                <TicketRows tickets={tickets.data} />
              </Card>
            </section>
          )}
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
                  <StageName stage={q.stage} />
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
