'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TicketDetail } from '@udhay/shared';
import { ArrowLeft, Phone, ShieldCheck, ShieldOff, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { useDirectory } from '@/components/mentions';
import { ReasonOnly } from '@/components/project/payments-tab';
import { todayInput } from '@/components/project/shared';
import { TicketStatusBadge } from '@/components/service/tickets';
import { DueBadge, PriorityBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn, formatDate, timeAgo } from '@/lib/utils';

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<'visit' | 'resolve' | 'close' | null>(null);
  const { data: t, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<TicketDetail>(`/service/tickets/${id}`),
  });
  const { data: users } = useDirectory();
  const technicians = users?.filter((u) => u.team?.code === 'SERVICE') ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', id] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const act = useMutation({
    mutationFn: ({ path, json }: { path: string; json?: unknown }) => api(`/service/tickets/${id}/${path}`, { method: 'POST', json: json ?? {} }),
    onSuccess: () => {
      refresh();
      setSheet(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (error || !t) {
    return (
      <Card>
        <EmptyState title="Ticket not found" />
      </Card>
    );
  }
  const open = t.status === 'OPEN' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS';

  return (
    <div className="mx-auto max-w-3xl pb-24 md:pb-0">
      <Link href="/service" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Service
      </Link>
      <PageHeader title={t.title} subtitle={`${t.code} · raised by ${t.raisedBy.name} ${timeAgo(t.createdAt)}`} />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TicketStatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} />
          {open && <DueBadge startedAt={t.createdAt} dueAt={t.dueAt} />}
          {t.underWarranty ? (
            <Badge tone="green">
              <ShieldCheck className="size-3" /> under warranty{t.warrantyEnd && ` until ${formatDate(t.warrantyEnd)}`}
            </Badge>
          ) : (
            <Badge>
              <ShieldOff className="size-3" /> out of warranty
            </Badge>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[13px]">{t.description}</p>
        <div className="grid gap-2 text-[13px] sm:grid-cols-2">
          <p>
            <span className="text-muted">Customer: </span>
            <Link href={`/projects/${t.project.id}`} className="font-medium hover:text-brand-600">
              {t.project.customerName} ({t.project.code})
            </Link>
          </p>
          {(t.contactName || t.contactPhone) && (
            <p className="flex items-center gap-1.5">
              <span className="text-muted">Contact:</span> {t.contactName}
              {t.contactPhone && (
                <a href={`tel:${t.contactPhone}`} className="inline-flex items-center gap-1 font-medium">
                  <Phone className="size-3" /> {t.contactPhone}
                </a>
              )}
            </p>
          )}
        </div>

        {t.canManage && open ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">Technician</span>
            <Select
              className="h-8 max-w-56 text-[13px]"
              value={t.assignee?.id ?? ''}
              onChange={(e) => e.target.value && act.mutate({ path: 'assign', json: { userId: e.target.value } })}
            >
              <option value="">Choose…</option>
              {technicians.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="text-[13px]">
            <span className="text-muted">Technician: </span>
            {t.assignee?.name ?? 'Unassigned'}
          </p>
        )}

        {t.resolution && (
          <p className="rounded-lg bg-ok/10 px-3 py-2 text-[13px] text-ok">
            Resolved {formatDate(t.resolvedAt, true)}: {t.resolution}
          </p>
        )}
        {t.csatRating != null && (
          <p className="flex items-center gap-1 text-[13px]">
            <span className="text-muted">Customer rating:</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn('size-4', i < t.csatRating! ? 'fill-brand text-brand' : 'text-line')} />
            ))}
            {t.csatComment && <span className="ml-1 text-muted">“{t.csatComment}”</span>}
          </p>
        )}

        {t.canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {open && <Button onClick={() => setSheet('visit')}>Log visit</Button>}
            {open && <Button variant="secondary" onClick={() => setSheet('resolve')}>Mark resolved</Button>}
            {t.status === 'RESOLVED' && <Button onClick={() => setSheet('close')}>Close with feedback</Button>}
            {!open && <Button variant="ghost" onClick={() => act.mutate({ path: 'reopen' })}>Reopen</Button>}
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title={`Visits (${t.visits.length})`} />
        {!t.visits.length ? (
          <EmptyState title="No visits logged" />
        ) : (
          <ul className="divide-y">
            {t.visits.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <p className="text-[12px] text-muted">
                  {formatDate(v.visitDate)} · {v.technician.name}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{v.workDone}</p>
                {v.partsUsed && <p className="mt-1 text-[12px] text-muted">Parts: {v.partsUsed}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={sheet === 'visit'} onClose={() => setSheet(null)} title="Log a service visit">
        <VisitForm busy={act.isPending} onSubmit={(json) => act.mutate({ path: 'visits', json })} />
      </Sheet>
      <Sheet open={sheet === 'resolve'} onClose={() => setSheet(null)} title="Mark resolved">
        <ReasonOnly label="How was it fixed?" confirm="Mark resolved" busy={act.isPending} onSubmit={(resolution) => act.mutate({ path: 'resolve', json: { resolution } })} />
      </Sheet>
      <Sheet open={sheet === 'close'} onClose={() => setSheet(null)} title="Close ticket">
        <CloseForm busy={act.isPending} onSubmit={(json) => act.mutate({ path: 'close', json })} />
      </Sheet>
    </div>
  );
}

function VisitForm({ busy, onSubmit }: { busy: boolean; onSubmit: (v: { visitDate: string; workDone: string; partsUsed?: string }) => void }) {
  const [date, setDate] = useState(todayInput());
  const [work, setWork] = useState('');
  const [parts, setParts] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (work.trim().length >= 3) {
          onSubmit({ visitDate: new Date(`${date}T12:00:00`).toISOString(), workDone: work.trim(), partsUsed: parts.trim() || undefined });
        }
      }}
    >
      <Field label="Visit date">
        <Input type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Work done">
        <Textarea autoFocus rows={4} value={work} onChange={(e) => setWork(e.target.value)} />
      </Field>
      <Field label="Spare parts used (optional)">
        <Input value={parts} onChange={(e) => setParts(e.target.value)} maxLength={2000} />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={work.trim().length < 3}>
        Save visit
      </Button>
    </form>
  );
}

function CloseForm({ busy, onSubmit }: { busy: boolean; onSubmit: (v: { csatRating?: number; csatComment?: string }) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ csatRating: rating || undefined, csatComment: comment.trim() || undefined });
      }}
    >
      <div>
        <p className="mb-2 text-[13px] font-medium">How satisfied was the customer?</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} stars`}>
              <Star className={cn('size-8', n <= rating ? 'fill-brand text-brand' : 'text-line')} />
            </button>
          ))}
        </div>
      </div>
      <Field label="Customer comment (optional)">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        Close ticket
      </Button>
    </form>
  );
}
