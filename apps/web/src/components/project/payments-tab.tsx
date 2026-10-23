'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_LABELS,
  PAYMENT_MODES,
  type PaymentKind,
  type PaymentMilestoneItem,
  type PaymentSummary,
} from '@udhay/shared';
import { Plus, Undo2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
import { todayInput, useProjectRefresh } from './shared';

const STANDARD_SPLIT: [PaymentKind, string, number][] = [
  ['ADVANCE', 'Advance', 50],
  ['PRE_DISPATCH', 'Before dispatch', 40],
  ['FINAL', 'Final on handover', 10],
];

export function PaymentsTab({ projectId, projectValue }: { projectId: string; projectValue: number | null }) {
  const refresh = useProjectRefresh(projectId);
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'payments'],
    queryFn: () => api<PaymentSummary>(`/projects/${projectId}/payments`),
  });
  const [adding, setAdding] = useState(false);
  const [receiving, setReceiving] = useState<PaymentMilestoneItem | null>(null);
  const [waiving, setWaiving] = useState<PaymentMilestoneItem | null>(null);

  const act = useMutation({
    mutationFn: ({ path, method = 'POST', json }: { path: string; method?: string; json?: unknown }) =>
      api(path, { method, json }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const quickSetup = useMutation({
    mutationFn: async () => {
      for (const [kind, label, pct] of STANDARD_SPLIT) {
        await api(`/projects/${projectId}/payments`, {
          method: 'POST',
          json: { kind, label: `${label} (${pct}%)`, amount: Math.round(((projectValue ?? 0) * pct) / 100) },
        });
      }
    },
    onSuccess: () => {
      toast.success('Milestones added; adjust amounts or dates as needed');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="m-4 h-40" />;

  return (
    <div>
      <div className="grid grid-cols-3 divide-x border-b text-center">
        {[
          ['Planned', data.totalPlanned],
          ['Received', data.totalReceived],
          ['Outstanding', data.outstanding],
        ].map(([label, value]) => (
          <div key={label as string} className="px-2 py-3">
            <p className="text-[11px] text-muted">{label}</p>
            <p className={`tabular mt-0.5 text-[15px] font-semibold ${label === 'Outstanding' && (value as number) > 0 ? 'text-warn' : ''}`}>
              {formatINR(value as number, true)}
            </p>
          </div>
        ))}
      </div>

      {data.canManage && (
        <div className="flex flex-wrap gap-2 border-b p-4">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Add milestone
          </Button>
          {!data.milestones.length && projectValue ? (
            <Button variant="ghost" loading={quickSetup.isPending} onClick={() => quickSetup.mutate()}>
              <Wand2 /> Standard 50 / 40 / 10 split
            </Button>
          ) : null}
        </div>
      )}

      {!data.milestones.length ? (
        <EmptyState title="No payment milestones yet" hint="Add the advance, before-dispatch and final payments." />
      ) : (
        <ul className="divide-y">
          {data.milestones.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{m.label}</p>
                  <p className="text-[11px] text-muted">
                    {PAYMENT_KIND_LABELS[m.kind]}
                    {m.dueDate && ` · due ${formatDate(m.dueDate)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-[14px] font-semibold">{formatINR(m.amount)}</p>
                  {m.status === 'RECEIVED' ? (
                    <Badge tone="green">received</Badge>
                  ) : m.status === 'WAIVED' ? (
                    <Badge>waived</Badge>
                  ) : (
                    <Badge tone="amber">pending</Badge>
                  )}
                </div>
              </div>
              {m.status === 'RECEIVED' && (
                <p className="mt-1 text-[12px] text-muted">
                  {formatINR(m.receivedAmount)} on {formatDate(m.receivedAt)} · {m.mode}
                  {m.reference && ` · ref ${m.reference}`}
                  {m.recordedBy && ` · by ${m.recordedBy.name}`}
                </p>
              )}
              {m.notes && <p className="mt-1 text-[12px] text-muted">{m.notes}</p>}
              {data.canManage && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.status === 'PENDING' ? (
                    <>
                      <Button size="sm" onClick={() => setReceiving(m)}>Record receipt</Button>
                      <Button size="sm" variant="ghost" onClick={() => setWaiving(m)}>Waive</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-bad"
                        onClick={() => confirm(`Delete "${m.label}"?`) && act.mutate({ path: `/payments/${m.id}`, method: 'DELETE' })}
                      >
                        Delete
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm('Undo this and mark the milestone pending again?') && act.mutate({ path: `/payments/${m.id}/reopen` })}
                    >
                      <Undo2 /> Undo
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add payment milestone">
        <AddMilestoneForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title={`Record receipt · ${receiving?.label ?? ''}`}>
        {receiving && (
          <ReceiveForm
            milestone={receiving}
            onDone={() => {
              setReceiving(null);
              refresh();
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!waiving} onClose={() => setWaiving(null)} title={`Waive · ${waiving?.label ?? ''}`}>
        {waiving && (
          <ReasonOnly
            label="Why is this payment waived?"
            confirm="Waive payment"
            onSubmit={(reason) =>
              act.mutate(
                { path: `/payments/${waiving.id}/waive`, json: { reason } },
                { onSuccess: () => setWaiving(null) },
              )
            }
            busy={act.isPending}
          />
        )}
      </Sheet>
    </div>
  );
}

function AddMilestoneForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [kind, setKind] = useState<PaymentKind>('ADVANCE');
  const [label, setLabel] = useState(PAYMENT_KIND_LABELS.ADVANCE);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/payments`, {
        method: 'POST',
        json: { kind, label: label.trim(), amount: Number(amount), dueDate: dueDate || undefined },
      }),
    onSuccess: () => {
      toast.success('Milestone added');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = label.trim().length >= 2 && Number(amount) >= 0 && amount !== '';
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Field label="Type">
        <Select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as PaymentKind;
            setKind(k);
            setLabel(PAYMENT_KIND_LABELS[k]);
          }}
        >
          {PAYMENT_KINDS.map((k) => (
            <option key={k} value={k}>{PAYMENT_KIND_LABELS[k]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Due date (optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!valid}>
        Add milestone
      </Button>
    </form>
  );
}

function ReceiveForm({ milestone, onDone }: { milestone: PaymentMilestoneItem; onDone: () => void }) {
  const [amount, setAmount] = useState(String(milestone.amount));
  const [date, setDate] = useState(todayInput());
  const [mode, setMode] = useState<string>(PAYMENT_MODES[0]);
  const [reference, setReference] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api(`/payments/${milestone.id}/receive`, {
        method: 'POST',
        json: { receivedAmount: Number(amount), receivedAt: new Date(`${date}T12:00:00`).toISOString(), mode, reference: reference || undefined },
      }),
    onSuccess: () => {
      toast.success('Payment recorded');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount received (₹)">
          <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Received on">
          <Input type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference (UTR / cheque no.)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </Field>
      </div>
      {Number(amount) !== milestone.amount && amount !== '' && (
        <p className="text-[12px] text-warn">Differs from the planned {formatINR(milestone.amount)}. Add a separate milestone for any balance.</p>
      )}
      <Button type="submit" className="w-full" loading={save.isPending} disabled={amount === '' || Number(amount) < 0}>
        Record receipt
      </Button>
    </form>
  );
}

export function ReasonOnly({
  label,
  confirm,
  onSubmit,
  busy,
}: {
  label: string;
  confirm: string;
  onSubmit: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length >= 3) onSubmit(reason.trim());
      }}
    >
      <Field label={label}>
        <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={reason.trim().length < 3}>
        {confirm}
      </Button>
    </form>
  );
}
