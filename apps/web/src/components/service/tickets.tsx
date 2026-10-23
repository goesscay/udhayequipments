'use client';

import { useMutation } from '@tanstack/react-query';
import { PRIORITIES, type Priority, type TicketListItem, type TicketStatus } from '@udhay/shared';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDirectory } from '@/components/mentions';
import { DueBadge, PriorityBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { humanize, timeAgo } from '@/lib/utils';

export const TICKET_TONE: Record<TicketStatus, BadgeTone> = {
  OPEN: 'blue',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'amber',
  RESOLVED: 'green',
  CLOSED: 'neutral',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={TICKET_TONE[status]}>{humanize(status)}</Badge>;
}

const isOpen = (s: TicketStatus) => s === 'OPEN' || s === 'ASSIGNED' || s === 'IN_PROGRESS';

export function TicketRows({ tickets, showProject = true }: { tickets: TicketListItem[]; showProject?: boolean }) {
  return (
    <ul className="divide-y">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link href={`/service/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-medium text-muted">{t.code}</span>
                <TicketStatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                {t.underWarranty && (
                  <Badge tone="green">
                    <ShieldCheck className="size-3" /> warranty
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-[14px] font-medium">{t.title}</p>
              <p className="truncate text-[12px] text-muted">
                {showProject && `${t.project.customerName} · ${t.project.code} · `}
                {t.assignee?.name ?? 'Unassigned'} · {timeAgo(t.createdAt)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {isOpen(t.status) && <DueBadge startedAt={t.createdAt} dueAt={t.dueAt} />}
              <ChevronRight className="size-4 text-muted" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RaiseTicketForm({
  projectId,
  defaultContact,
  onDone,
}: {
  projectId: string;
  defaultContact?: { name: string | null; phone: string };
  onDone: (ticket: { id: string; code: string }) => void;
}) {
  const { data: users } = useDirectory();
  const technicians = users?.filter((u) => u.team?.code === 'SERVICE') ?? [];
  const [f, setF] = useState({
    title: '',
    description: '',
    priority: 'NORMAL' as Priority,
    contactName: defaultContact?.name ?? '',
    contactPhone: defaultContact?.phone ?? '',
    assigneeId: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string; code: string }>('/service/tickets', {
        method: 'POST',
        json: {
          projectId,
          title: f.title.trim(),
          description: f.description.trim(),
          priority: f.priority,
          contactName: f.contactName.trim() || undefined,
          contactPhone: f.contactPhone.trim() || undefined,
          assigneeId: f.assigneeId || undefined,
        },
      }),
    onSuccess: (t) => {
      toast.success(`Ticket ${t.code} raised`);
      onDone(t);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = f.title.trim().length >= 3 && f.description.trim().length >= 3;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Field label="Issue">
        <Input autoFocus placeholder="e.g. Burner 2 not igniting" value={f.title} onChange={set('title')} maxLength={200} />
      </Field>
      <Field label="Details">
        <Textarea rows={3} value={f.description} onChange={set('description')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select value={f.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{humanize(p)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Assign technician">
          <Select value={f.assigneeId} onChange={set('assigneeId')}>
            <option value="">Later</option>
            {technicians.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contact at site">
          <Input value={f.contactName} onChange={set('contactName')} maxLength={120} />
        </Field>
        <Field label="Contact phone">
          <Input type="tel" value={f.contactPhone} onChange={set('contactPhone')} maxLength={20} />
        </Field>
      </div>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!valid}>
        Raise ticket
      </Button>
    </form>
  );
}
