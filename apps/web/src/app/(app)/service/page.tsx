'use client';

import { useQuery } from '@tanstack/react-query';
import type { TicketListItem } from '@udhay/shared';
import { Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { TicketRows } from '@/components/service/tickets';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const FILTERS = [
  { id: 'open', label: 'Open', query: 'status=OPEN_ANY' },
  { id: 'mine', label: 'Assigned to me', query: 'status=OPEN_ANY&mine=true' },
  { id: 'resolved', label: 'Resolved', query: 'status=RESOLVED' },
  { id: 'all', label: 'All', query: '' },
] as const;

export default function ServicePage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const [q, setQ] = useState('');
  const search = useDeferredValue(q.trim());
  const query = [FILTERS.find((f) => f.id === filter)!.query, search && `search=${encodeURIComponent(search)}`]
    .filter(Boolean)
    .join('&');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', query],
    queryFn: () => api<TicketListItem[]>(`/service/tickets${query ? `?${query}` : ''}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Service"
        subtitle="Customer issues after handover. Raise a ticket from the project's Service tab."
      />
      <div className="mb-4 space-y-2 md:flex md:items-center md:gap-3 md:space-y-0">
        <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-lg border bg-white p-1 text-[13px] md:w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 font-medium',
                filter === f.id ? 'bg-brand-50 text-brand-600' : 'text-muted',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Ticket, project or customer" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <Card>
          <EmptyState title="No tickets here" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TicketRows tickets={data} />
        </Card>
      )}
    </>
  );
}
