'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TEAM_LABELS, type StageCode } from '@udhay/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useWorkflow } from '@/lib/workflow';

interface StageSla {
  stage: StageCode;
  slaHours: number;
  defaultHours: number;
}

const describe = (h: number) => (h >= 48 ? `${+(h / 24).toFixed(1)} days` : `${h} hours`);

export function StageTargets() {
  const qc = useQueryClient();
  const wf = useWorkflow();
  const { data, isLoading } = useQuery({ queryKey: ['stage-slas'], queryFn: () => api<StageSla[]>('/settings/stage-slas') });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((s) => [s.stage, String(s.slaHours)])));
  }, [data]);

  const parsed = data?.map((s) => ({ ...s, next: Number(values[s.stage]) }));
  const invalid = parsed?.some((s) => !Number.isInteger(s.next) || s.next < 1 || s.next > 17_520);
  const dirty = parsed?.some((s) => s.next !== s.slaHours);

  const save = useMutation({
    mutationFn: () =>
      api<StageSla[]>('/settings/stage-slas', {
        method: 'PUT',
        json: { stages: parsed!.map((s) => ({ stage: s.stage, slaHours: s.next })) },
      }),
    onSuccess: (rows) => {
      qc.setQueryData(['stage-slas'], rows);
      toast.success('Stage targets saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !parsed) return <Skeleton className="h-96" />;

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Target time per stage</h2>
        <p className="mt-1 text-[13px] text-muted">
          Used for due dates, the overdue flags and deadline alerts. Changes apply to stages that start after you save;
          work already in progress keeps its current due date.
        </p>
      </div>
      <ul className="divide-y">
        {parsed.map((s, i) => {
          const def = wf.stage(s.stage);
          const bad = !Number.isInteger(s.next) || s.next < 1 || s.next > 17_520;
          return (
            <li key={s.stage} className="flex items-center gap-3 px-4 py-2.5">
              <span className="tabular w-5 text-[12px] text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{def.label}</p>
                <p className="text-[11px] text-muted">
                  {TEAM_LABELS[def.team]} · default {describe(s.defaultHours)}
                  {!def.enabled && ' · switched off'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={17520}
                  className={`tabular h-9 w-24 text-right ${bad ? 'border-bad focus:ring-bad/30' : ''}`}
                  value={values[s.stage] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [s.stage]: e.target.value }))}
                  aria-label={`${def.label} target in hours`}
                />
                <span className="w-16 text-[12px] text-muted">{bad ? 'hours' : describe(s.next)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-[57px] flex justify-end gap-2 border-t bg-white/95 p-3 backdrop-blur md:bottom-0">
        <Button
          variant="secondary"
          disabled={!dirty}
          onClick={() => setValues(Object.fromEntries(data!.map((s) => [s.stage, String(s.slaHours)])))}
        >
          Reset
        </Button>
        <Button loading={save.isPending} disabled={!dirty || invalid} onClick={() => save.mutate()}>
          Save targets
        </Button>
      </div>
    </Card>
  );
}
