'use client';

import { useQuery } from '@tanstack/react-query';
import type { TicketListItem } from '@udhay/shared';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RaiseTicketForm, TicketRows } from '@/components/service/tickets';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function ServiceTab({
  projectId,
  canRaise,
  contact,
}: {
  projectId: string;
  canRaise: boolean;
  contact: { name: string | null; phone: string };
}) {
  const router = useRouter();
  const { user, can } = useAuth();
  const [raising, setRaising] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'tickets'],
    queryFn: () => api<TicketListItem[]>(`/service/tickets?projectId=${projectId}`),
    enabled: can('service.view'),
  });
  const mayRaise =
    canRaise && !!user && !!user.permissions['service.manage'] && (user.permissions['service.manage'] === 'ALL' || user.team?.code === 'SERVICE');

  if (!can('service.view')) return <EmptyState title="You don't have access to service tickets" />;
  if (isLoading) return <Skeleton className="m-4 h-32" />;

  return (
    <div>
      {mayRaise && (
        <div className="border-b p-4">
          <Button variant="secondary" onClick={() => setRaising(true)}>
            <Plus /> Raise service ticket
          </Button>
        </div>
      )}
      {!data?.length ? (
        <EmptyState title="No service tickets" hint="Customer complaints after handover are tracked here." />
      ) : (
        <TicketRows tickets={data} showProject={false} />
      )}
      <Sheet open={raising} onClose={() => setRaising(false)} title="Raise service ticket">
        <RaiseTicketForm projectId={projectId} defaultContact={contact} onDone={(t) => router.push(`/service/${t.id}`)} />
      </Sheet>
    </div>
  );
}
