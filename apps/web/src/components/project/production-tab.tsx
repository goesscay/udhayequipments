'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ItemStatus, ProductionItemRow, ProductionSummary } from '@udhay/shared';
import { CheckCircle2, ClipboardPaste, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ReasonOnly } from './payments-tab';
import { Notice, ProgressBar, useProjectRefresh } from './shared';

const STATUS_LABEL: Record<ItemStatus, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done' };

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
  const done = data.items.filter((i) => i.status === 'DONE').length;
  const passed = data.items.filter((i) => i.qcStatus === 'PASSED').length;

  return (
    <div>
      <div className="space-y-2 border-b p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">Overall progress</span>
          <span className="tabular text-muted">
            {data.progress}% · {done}/{data.items.length} done · {passed} QC passed
          </span>
        </div>
        <ProgressBar value={data.progress} tone={data.readyForDispatch ? 'ok' : 'brand'} />
        {data.readyForDispatch && <Notice tone="green">All items finished and quality-checked. Ready for dispatch.</Notice>}
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

              {manage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    className="h-8 w-36 text-[13px]"
                    value={i.status}
                    onChange={(e) => act.mutate({ path: `/production/items/${i.id}`, method: 'PATCH', json: { status: e.target.value } })}
                  >
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    defaultValue={i.progress}
                    key={`${i.id}-${i.progress}`}
                    onPointerUp={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (v !== i.progress) act.mutate({ path: `/production/items/${i.id}`, method: 'PATCH', json: { progress: v } });
                    }}
                    onKeyUp={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (v !== i.progress) act.mutate({ path: `/production/items/${i.id}`, method: 'PATCH', json: { progress: v } });
                    }}
                    className="flex-1 accent-[#B8862B]"
                    aria-label={`${i.name} progress`}
                  />
                  <span className="tabular w-10 text-right text-[12px] text-muted">{i.progress}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ProgressBar value={i.progress} className="flex-1" />
                  <span className="tabular text-[12px] text-muted">{STATUS_LABEL[i.status]}</span>
                </div>
              )}

              {manage && (
                <div className="flex flex-wrap gap-1.5">
                  {i.status === 'DONE' && i.qcStatus !== 'PASSED' && (
                    <Button size="sm" onClick={() => act.mutate({ path: `/production/items/${i.id}/qc`, json: { result: 'PASSED' } })}>
                      <CheckCircle2 /> Pass QC
                    </Button>
                  )}
                  {i.status === 'DONE' && (
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => setFailing(i)}>
                      <XCircle /> Fail QC
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-muted"
                    onClick={() => confirm(`Remove "${i.name}"?`) && act.mutate({ path: `/production/items/${i.id}`, method: 'DELETE' })}
                    aria-label={`Remove ${i.name}`}
                  >
                    <Trash2 />
                  </Button>
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
