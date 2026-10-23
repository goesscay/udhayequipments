'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRIORITIES, type AppRules, type Priority } from '@udhay/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';

export function RulesEditor() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rules'], queryFn: () => api<AppRules>('/settings/rules') });
  const [draft, setDraft] = useState<AppRules | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api<AppRules>('/settings/rules', { method: 'PUT', json: draft }),
    onSuccess: (r) => {
      qc.setQueryData(['rules'], r);
      toast.success('Rules saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !draft || !data) return <Skeleton className="h-80" />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const invalid =
    !Number.isInteger(draft.defaultWarrantyMonths) ||
    draft.defaultWarrantyMonths < 0 ||
    PRIORITIES.some((p) => !Number.isInteger(draft.ticketSlaHours[p]) || draft.ticketSlaHours[p] < 1);

  return (
    <Card className="divide-y overflow-hidden">
      <section className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Payment rules</h2>
        <Toggle
          checked={draft.advanceBeforeProduction}
          onChange={(v) => setDraft({ ...draft, advanceBeforeProduction: v })}
          title="No production without the advance"
          detail="The Overall Head can't release a project to Production until an Advance payment is received or waived."
        />
        <Toggle
          checked={draft.preDispatchBeforeDispatch}
          onChange={(v) => setDraft({ ...draft, preDispatchBeforeDispatch: v })}
          title="No dispatch without the before-dispatch payment"
          detail="Trips can't be marked dispatched until a Before-dispatch payment is received or waived."
        />
      </section>

      <section className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Warranty</h2>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            Default warranty
            <span className="block text-[12px] text-muted">Pre-filled on the handover form; can be changed per project.</span>
          </span>
          <span className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={120}
              className="tabular h-9 w-20 text-right"
              value={draft.defaultWarrantyMonths}
              onChange={(e) => setDraft({ ...draft, defaultWarrantyMonths: Number(e.target.value) })}
            />
            <span className="text-[12px] text-muted">months</span>
          </span>
        </label>
      </section>

      <section className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Service ticket response time</h2>
        <p className="text-[12px] text-muted">A ticket is overdue after this many hours; the technician and Service head get an alert.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRIORITIES.map((p: Priority) => (
            <label key={p} className="space-y-1 text-[13px]">
              <span>{humanize(p)}</span>
              <span className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={2000}
                  className="tabular h-9 text-right"
                  value={draft.ticketSlaHours[p]}
                  onChange={(e) => setDraft({ ...draft, ticketSlaHours: { ...draft.ticketSlaHours, [p]: Number(e.target.value) } })}
                />
                <span className="text-[12px] text-muted">h</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="sticky bottom-[57px] flex justify-end gap-2 bg-white/95 p-3 backdrop-blur md:bottom-0">
        <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(data)}>
          Reset
        </Button>
        <Button loading={save.isPending} disabled={!dirty || invalid} onClick={() => save.mutate()}>
          Save rules
        </Button>
      </div>
    </Card>
  );
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="text-[13px]">
        {title}
        <span className="block text-[12px] text-muted">{detail}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-none bg-line transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-none bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
