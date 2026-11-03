'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  PRODUCTION_LEVELS,
  PRODUCTION_LEVEL_LABELS,
  type ProductionItemRow,
  type ProductionLevel,
  type ProductionSummary,
} from '@udhay/shared';
import { Check, CheckCircle2, ClipboardPaste, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { ReasonOnly } from './payments-tab';
import { Notice, ProgressBar, useProjectRefresh } from './shared';

/** Where an item is: before the first level, at one of the four, or through all of them. */
function stepOf(i: ProductionItemRow): number {
  if (i.status === 'DONE') return PRODUCTION_LEVELS.length;
  if (i.status === 'NOT_STARTED' || !i.level) return -1;
  return PRODUCTION_LEVELS.indexOf(i.level);
}

function itemState(i: ProductionItemRow): string {
  if (i.status === 'DONE') return 'All levels done';
  if (i.status === 'NOT_STARTED' || !i.level) return 'Not started';
  return `At ${PRODUCTION_LEVEL_LABELS[i.level]}`;
}

export function ProductionTab({ projectId, active }: { projectId: string; active: boolean }) {
  const refresh = useProjectRefresh(projectId);
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'production'],
    queryFn: () => api<ProductionSummary>(`/projects/${projectId}/production`),
  });
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [failing, setFailing] = useState<ProductionItemRow | null>(null);

  const act = useMutation({
    mutationFn: ({ path, method = 'POST', json }: { path: string; method?: string; json?: unknown }) =>
      api(path, { method, json }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="m-4 h-40" />;
  const manage = data.canManage && active;
  const qc = data.canQc && active;
  const passed = data.items.filter((i) => i.qcStatus === 'PASSED').length;
  const patch = (i: ProductionItemRow, json: object) =>
    act.mutate({ path: `/production/items/${i.id}`, method: 'PATCH', json });

  return (
    <div>
      <div className="space-y-2 border-b p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">Overall progress</span>
          <span className="tabular text-muted">
            {data.progress}% · {data.counts.DONE}/{data.items.length} done · {passed} QC passed
          </span>
        </div>
        <ProgressBar value={data.progress} tone={data.readyForDispatch ? 'ok' : 'brand'} />
        {data.items.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center sm:grid-cols-6">
            {(['NOT_STARTED', ...PRODUCTION_LEVELS, 'DONE'] as const).map((k) => (
              <div key={k} className="rounded-lg border bg-surface px-1.5 py-1">
                <p className="tabular text-[15px] font-semibold">{data.counts[k]}</p>
                <p className="text-[11px] leading-tight text-muted">
                  {k === 'NOT_STARTED' ? 'Not started' : k === 'DONE' ? 'Done' : PRODUCTION_LEVEL_LABELS[k]}
                </p>
              </div>
            ))}
          </div>
        )}
        {data.readyForDispatch ? (
          <Notice tone="green">All items finished and quality-checked. Ready for dispatch.</Notice>
        ) : data.readyForQc ? (
          <Notice tone="green">Every item has been through all four levels. Ready for QC.</Notice>
        ) : null}
        {qc && <Notice>Check each item, then pass or fail it. Failed items go back to Production.</Notice>}
        {manage && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus /> Add item
            </Button>
            <Button variant="ghost" onClick={() => setPasting(true)}>
              <ClipboardPaste /> Paste list
            </Button>
          </div>
        )}
      </div>

      {!data.items.length ? (
        <EmptyState title="No job cards yet" hint="Production adds one item per equipment piece from the BOQ." />
      ) : (
        <ul className="divide-y">
          {data.items.map((i) => (
            <li key={i.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {i.name} <span className="font-normal text-muted">× {i.quantity}</span>
                  </p>
                  {i.spec && <p className="text-[12px] text-muted">{i.spec}</p>}
                </div>
                <QcBadge item={i} />
              </div>

              <LevelSteps item={i} onPick={manage ? (json) => patch(i, json) : undefined} />

              {(manage || qc) && (
                <div className="flex flex-wrap gap-1.5">
                  {qc && i.status === 'DONE' && i.qcStatus !== 'PASSED' && (
                    <Button size="sm" onClick={() => act.mutate({ path: `/production/items/${i.id}/qc`, json: { result: 'PASSED' } })}>
                      <CheckCircle2 /> Pass QC
                    </Button>
                  )}
                  {qc && i.status === 'DONE' && (
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => setFailing(i)}>
                      <XCircle /> Fail QC
                    </Button>
                  )}
                  {manage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-muted"
                    onClick={() => confirm(`Remove "${i.name}"?`) && act.mutate({ path: `/production/items/${i.id}`, method: 'DELETE' })}
                    aria-label={`Remove ${i.name}`}
                  >
                    <Trash2 />
                  </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add production item">
        <AddItemForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={pasting} onClose={() => setPasting(false)} title="Paste item list">
        <PasteForm
          projectId={projectId}
          onDone={() => {
            setPasting(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={!!failing} onClose={() => setFailing(null)} title={`QC failed · ${failing?.name ?? ''}`}>
        {failing && (
          <ReasonOnly
            label="What needs fixing?"
            confirm="Mark QC failed"
            busy={act.isPending}
            onSubmit={(notes) =>
              act.mutate(
                { path: `/production/items/${failing.id}/qc`, json: { result: 'FAILED', notes } },
                { onSuccess: () => setFailing(null) },
              )
            }
          />
        )}
      </Sheet>
    </div>
  );
}

/**
 * The four production levels as steps. Production taps the level an item is at, or Done once
 * Polish is finished; everyone else sees where it is.
 */
function LevelSteps({ item, onPick }: { item: ProductionItemRow; onPick?: (json: { level?: ProductionLevel; status?: 'DONE' | 'NOT_STARTED' }) => void }) {
  const at = stepOf(item);
  const steps = [...PRODUCTION_LEVELS.map((l) => ({ key: l, label: PRODUCTION_LEVEL_LABELS[l] })), { key: 'DONE', label: 'Done' }];
  return (
    <div className="space-y-1">
      <div className="flex gap-1" role="group" aria-label={`${item.name} production level`}>
        {steps.map((st, idx) => {
          const passedStep = idx < at || (st.key === 'DONE' && at === PRODUCTION_LEVELS.length);
          const current = idx === at && st.key !== 'DONE';
          const cls = cn(
            'flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border px-1 text-center text-[11px] leading-tight',
            passedStep && 'border-transparent bg-ok/15 text-ok',
            current && 'border-brand bg-brand/10 font-semibold text-ink',
            !passedStep && !current && 'bg-white text-muted',
            onPick && 'hover:border-brand/60',
          );
          const content = (
            <>
              {passedStep && <Check className="size-3 shrink-0" />}
              {st.label}
            </>
          );
          if (!onPick) return <span key={st.key} className={cls}>{content}</span>;
          const isCurrent = st.key === 'DONE' ? at === PRODUCTION_LEVELS.length : current;
          return (
            <button
              key={st.key}
              type="button"
              className={cls}
              aria-pressed={isCurrent}
              title={st.key === 'DONE' ? 'Mark all four levels done' : `Item is at ${st.label}`}
              onClick={() => {
                if (isCurrent) return;
                onPick(st.key === 'DONE' ? { status: 'DONE' } : { level: st.key as ProductionLevel });
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>{itemState(item)}</span>
        {onPick && at >= 0 && (
          <button type="button" className="underline" onClick={() => onPick({ status: 'NOT_STARTED' })}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function QcBadge({ item }: { item: ProductionItemRow }) {
  if (item.qcStatus === 'PASSED') {
    return (
      <Badge tone="green" title={item.qcBy ? `by ${item.qcBy.name} on ${formatDate(item.qcAt)}` : undefined}>
        QC passed
      </Badge>
    );
  }
  if (item.qcStatus === 'FAILED') return <Badge tone="red" title={item.qcNotes ?? undefined}>QC failed</Badge>;
  return <Badge>QC pending</Badge>;
}

function AddItemForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [spec, setSpec] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/production/items`, {
        method: 'POST',
        json: { name: name.trim(), quantity: Number(quantity) || 1, spec: spec.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success('Item added');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length >= 2) save.mutate();
      }}
    >
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Field label="Item">
          <Input autoFocus placeholder="e.g. Three-burner range" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
        </Field>
        <Field label="Qty">
          <Input type="number" min={1} max={9999} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      </div>
      <Field label="Specification (optional)">
        <Textarea rows={3} placeholder="Size, material, finish…" value={spec} onChange={(e) => setSpec(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={name.trim().length < 2}>
        Add item
      </Button>
    </form>
  );
}

function PasteForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => api<{ created: number }>(`/projects/${projectId}/production/items/bulk`, { method: 'POST', json: { lines } }),
    onSuccess: (r) => {
      toast.success(`${r.created} items added`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (lines.length) save.mutate();
      }}
    >
      <Field label="One item per line" hint={'Quantities: "3 x Sink unit", "Sink unit x 3" or "Sink unit - 3 nos". "2 Burner range" stays one item.'}>
        <Textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Three-burner range\n2 x Work table with undershelf\nExhaust hood - 1 nos'} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!lines.length || lines.length > 200}>
        Add {lines.length || ''} item{lines.length === 1 ? '' : 's'}
      </Button>
    </form>
  );
}
