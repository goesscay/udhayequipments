'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { NotificationItem, NotificationPage, NotificationType } from '@udhay/shared';
import {
  AlarmClock,
  AlertTriangle,
  ArrowRightLeft,
  AtSign,
  CheckCircle2,
  Handshake,
  IndianRupee,
  Siren,
  Undo2,
  UserCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { PhoneNotificationsCard, PushBanner } from '@/components/phone-notifications';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useMarkRead } from '@/lib/notifications';
import { cn, formatDate, timeAgo } from '@/lib/utils';

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  HANDOFF: { icon: ArrowRightLeft, tone: 'text-brand bg-brand-50' },
  RETURNED: { icon: Undo2, tone: 'text-warn bg-warn/10' },
  ASSIGNED: { icon: UserCheck, tone: 'text-info bg-info/10' },
  CLOSED: { icon: CheckCircle2, tone: 'text-ok bg-ok/10' },
  SLA_DUE_SOON: { icon: AlarmClock, tone: 'text-warn bg-warn/10' },
  SLA_OVERDUE: { icon: AlertTriangle, tone: 'text-bad bg-bad/10' },
  SLA_ESCALATED: { icon: Siren, tone: 'text-bad bg-bad/10' },
  MENTION: { icon: AtSign, tone: 'text-brand bg-brand-50' },
  HANDOFF_ACCEPTED: { icon: Handshake, tone: 'text-ok bg-ok/10' },
  PAYMENT_RECEIVED: { icon: IndianRupee, tone: 'text-ok bg-ok/10' },
  TICKET_CREATED: { icon: Wrench, tone: 'text-info bg-info/10' },
  TICKET_ASSIGNED: { icon: Wrench, tone: 'text-brand bg-brand-50' },
  TICKET_OVERDUE: { icon: AlertTriangle, tone: 'text-bad bg-bad/10' },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const markRead = useMarkRead();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['notifications', 'list', unreadOnly],
    queryFn: ({ pageParam }) =>
      api<NotificationPage>(
        `/notifications?${new URLSearchParams({ ...(pageParam ? { cursor: pageParam } : {}), ...(unreadOnly ? { unread: 'true' } : {}) })}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const unread = data?.pages[0]?.unread ?? 0;

  const open = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.projectId) router.push(`/projects/${n.projectId}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'All caught up'}
        action={
          unread > 0 && (
            <Button variant="secondary" size="sm" onClick={() => markRead.mutate('all')} loading={markRead.isPending && markRead.variables === 'all'}>
              Mark all read
            </Button>
          )
        }
      />

      <PushBanner />

      <div className="mb-3 flex gap-1 rounded-lg border bg-white p-1 text-[13px] md:w-fit">
        {[
          [false, 'All'],
          [true, 'Unread'],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            onClick={() => setUnreadOnly(value as boolean)}
            className={cn(
              'flex-1 rounded-md px-4 py-1.5 font-medium md:flex-none',
              unreadOnly === value ? 'bg-brand-50 text-brand-600' : 'text-muted',
            )}
          >
            {label as string}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            hint="Handoffs, assignments and deadline alerts will appear here."
          />
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {items.map((n) => {
            const { icon: Icon, tone } = ICONS[n.type] ?? ICONS.HANDOFF;
            return (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface', !n.readAt && 'bg-brand-50/40')}
              >
                <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-none', tone)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn('text-[13px] leading-snug', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-none bg-brand" aria-label="Unread" />}
                  </span>
                  {n.body && <span className="mt-0.5 block whitespace-pre-line text-[12px] text-muted">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-muted" title={formatDate(n.createdAt, true)}>
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </Card>
      )}

      {hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}

      <PhoneNotificationsCard className="mt-6" />
    </div>
  );
}
