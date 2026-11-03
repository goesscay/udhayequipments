'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  LABEL_MAX,
  SHORT_MAX,
  TEAMS,
  TEAM_LABELS,
  normaliseWorkflowConfig,
  resolveWorkflow,
  type DocumentType,
  type ResolvedStage,
  type ResolvedTransition,
  type StageCode,
  type StageOverride,
  type TransitionOverride,
  type WorkflowConfig,
} from '@udhay/shared';
import { ArrowRight, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface WorkflowSettings {
  config: WorkflowConfig;
  activeProjects: Partial<Record<StageCode, number>>;
}

const EMPTY: WorkflowConfig = { stages: {}, transitions: {} };
const same = (a: WorkflowConfig, b: WorkflowConfig) =>
  JSON.stringify(normaliseWorkflowConfig(a)) === JSON.stringify(normaliseWorkflowConfig(b));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function WorkflowEditor() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-workflow'],
    queryFn: () => api<WorkflowSettings>('/settings/workflow'),
  });
  const [draft, setDraft] = useState<WorkflowConfig>(EMPTY);
  const [open, setOpen] = useState<StageCode | null>(null);

  useEffect(() => {
    if (data) setDraft(data.config);
  }, [data]);

  const saved = useMemo(() => resolveWorkflow(data?.config ?? EMPTY), [data]);
  const wf = useMemo(() => resolveWorkflow(draft), [draft]);
  const dirty = !!data && !same(draft, data.config);

  const save = useMutation({
    mutationFn: () => api<WorkflowSettings>('/settings/workflow', { method: 'PUT', json: normaliseWorkflowConfig(draft) }),
    onSuccess: (res) => {
      qc.setQueryData(['settings-workflow'], res);
      qc.setQueryData(['workflow'], res.config);
      for (const key of ['projects', 'project', 'dashboard', 'queue']) qc.invalidateQueries({ queryKey: [key] });
      toast.success('Workflow saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;

  const setStage = (code: StageCode, patch: StageOverride) =>
    setDraft((d) => ({ ...d, stages: { ...d.stages, [code]: { ...d.stages[code], ...patch } } }));
  const setTransition = (key: string, patch: TransitionOverride) =>
    setDraft((d) => ({ ...d, transitions: { ...d.transitions, [key]: { ...d.transitions[key], ...patch } } }));

  let step = 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Project workflow</h2>
        <p className="mt-1 text-[13px] text-muted">
          Rename stages and buttons, choose which team owns each stage, switch off stages you don&apos;t use, and decide which
          documents each step needs. Projects already sitting in a stage you switch off can still finish it. Payment,
          production, dispatch and handover checks keep applying.
        </p>
        <p className="mt-2 text-[12px] text-muted">
          {wf.activeStages.length} of {wf.stages.length} stages in use
        </p>
      </div>

      <ol className="divide-y">
        {wf.stages.map((s) => {
          if (s.enabled) step += 1;
          const count = data.activeProjects[s.code] ?? 0;
          const expanded = open === s.code;
          return (
            <li key={s.code} className={cn(!s.enabled && 'bg-surface/60')}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : s.code)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                aria-expanded={expanded}
              >
                <span
                  className={cn(
                    'tabular grid size-6 shrink-0 place-items-center border text-[11px] font-semibold',
                    s.enabled ? 'border-brand text-brand' : 'border-line text-muted',
                  )}
                >
                  {s.enabled ? step : '–'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[13px] font-medium', !s.enabled && 'text-muted line-through')}>
                    {s.label || s.defaults.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {TEAM_LABELS[s.team]}
                    {wf.from(s.code).length > 0 && ` · ${plural(wf.from(s.code).length, 'action')}`}
                  </span>
                </span>
                {count > 0 && <Badge tone="blue">{plural(count, 'project')}</Badge>}
                {!s.enabled && <Badge>Off</Badge>}
                <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />
              </button>

              {expanded && (
                <StagePanel
                  stage={s}
                  draft={draft}
                  savedTeam={saved.stage(s.code).team}
                  count={count}
                  transitions={wf.allFrom(s.code)}
                  stageLabel={(code) => wf.stage(code).label}
                  onStage={(patch) => setStage(s.code, patch)}
                  onTransition={setTransition}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-[57px] flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 p-3 backdrop-blur md:bottom-0">
        <Button
          variant="ghost"
          disabled={same(draft, EMPTY)}
          onClick={() => {
            if (confirm('Go back to the built-in workflow? Your renames and switched-off stages will be cleared when you save.')) {
              setDraft(EMPTY);
            }
          }}
        >
          Built-in workflow
        </Button>
        <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(data.config)}>
          Undo changes
        </Button>
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          Save workflow
        </Button>
      </div>
    </Card>
  );
}

function StagePanel({
  stage,
  draft,
  savedTeam,
  count,
  transitions,
  stageLabel,
  onStage,
  onTransition,
}: {
  stage: ResolvedStage;
  draft: WorkflowConfig;
  savedTeam: ResolvedStage['team'];
  count: number;
  transitions: ResolvedTransition[];
  stageLabel: (code: StageCode) => string;
  onStage: (patch: StageOverride) => void;
  onTransition: (key: string, patch: TransitionOverride) => void;
}) {
  // Inputs show what was typed; a blank name falls back to the built-in one (shown as the placeholder).
  const raw = draft.stages[stage.code] ?? {};
  return (
    <div className="space-y-4 border-t bg-surface/40 px-4 pb-4 pt-3 md:pl-13">
      <div className="grid gap-3 md:grid-cols-[1fr_10rem_11rem]">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Stage name</span>
          <Input
            value={raw.label ?? stage.defaults.label}
            maxLength={LABEL_MAX}
            onChange={(e) => onStage({ label: e.target.value })}
            placeholder={stage.defaults.label}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Short name</span>
          <Input
            value={raw.short ?? stage.defaults.short}
            maxLength={SHORT_MAX}
            onChange={(e) => onStage({ short: e.target.value })}
            placeholder={stage.defaults.short}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Owning team</span>
          <Select
            value={stage.team}
            disabled={stage.teamFixed}
            onChange={(e) => onStage({ team: e.target.value as ResolvedStage['team'] })}
          >
            {TEAMS.map((t) => (
              <option key={t} value={t}>{TEAM_LABELS[t]}</option>
            ))}
          </Select>
        </label>
      </div>
      {stage.teamFixed && (
        <p className="-mt-2 text-[12px] text-muted">Approved by anyone with the &ldquo;CAD approval&rdquo; permission, so the team is fixed.</p>
      )}
      {stage.team !== savedTeam && count > 0 && (
        <p className="-mt-2 text-[12px] text-warn">
          {plural(count, 'project')} in this stage will move to the {TEAM_LABELS[stage.team]} team when you save.
        </p>
      )}

      {stage.skippable ? (
        <Switch
          checked={stage.enabled}
          onChange={(v) => onStage({ enabled: v })}
          title="Use this stage"
          detail={
            stage.enabled
              ? 'Switch off to skip it: the step before goes straight to the next stage in use.'
              : `Skipped for new work.${count ? ` ${plural(count, 'project')} already here can still finish it.` : ''}`
          }
        />
      ) : (
        <p className="text-[12px] text-muted">This stage is always part of the workflow.</p>
      )}

      {transitions.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-medium text-muted">Actions from this stage</p>
          <ul className="space-y-2">
            {transitions.map((t) => (
              <TransitionRow key={t.key} t={t} rawLabel={draft.transitions[t.key]?.label} stageLabel={stageLabel} onChange={(patch) => onTransition(t.key, patch)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TransitionRow({
  t,
  rawLabel,
  stageLabel,
  onChange,
}: {
  t: ResolvedTransition;
  rawLabel: string | undefined;
  stageLabel: (code: StageCode) => string;
  onChange: (patch: TransitionOverride) => void;
}) {
  const docs = t.requiresDocuments ?? [];
  const addable = DOCUMENT_TYPES.filter((d) => !docs.includes(d));
  const setDocs = (next: DocumentType[]) => onChange({ requiresDocuments: next });
  const destination = t.to
    ? stageLabel(t.to)
    : t.outcome === 'LOST'
      ? 'Closes the project as lost'
      : t.outcome === 'COMPLETED'
        ? 'Closes the project as completed'
        : 'Closes the project';

  return (
    <li className={cn('border bg-white p-3', !t.enabled && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'size-2 shrink-0',
            t.tone === 'primary' ? 'bg-brand' : t.tone === 'danger' ? 'bg-bad' : 'bg-muted',
          )}
          aria-hidden
        />
        <Input
          className="h-9 min-w-0 flex-1"
          value={rawLabel ?? t.defaults.label}
          maxLength={LABEL_MAX}
          placeholder={t.defaults.label}
          onChange={(e) => onChange({ label: e.target.value })}
          aria-label="Button label"
        />
        {t.optional && (
          <Switch compact checked={t.enabled || !!t.disabledReason} onChange={(v) => onChange({ enabled: v })} title="On" />
        )}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[12px] text-muted">
        <ArrowRight className="size-3.5" />
        {destination}
        {t.to && t.defaults.to && t.to !== t.defaults.to && (
          <span className="text-warn"> (skipping {stageLabel(t.defaults.to)})</span>
        )}
      </p>
      {t.disabledReason && <p className="mt-1 text-[12px] text-warn">Unavailable: {t.disabledReason}.</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted">Needs:</span>
        {docs.length === 0 && <span className="text-[12px] text-muted">no documents</span>}
        {docs.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 border bg-surface px-1.5 py-0.5 text-[12px]">
            {DOCUMENT_LABELS[d]}
            <button
              type="button"
              className="text-muted hover:text-bad"
              onClick={() => setDocs(docs.filter((x) => x !== d))}
              aria-label={`Stop requiring ${DOCUMENT_LABELS[d]}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {addable.length > 0 && (
          <Select
            className="h-7 w-auto py-0 text-[12px]"
            value=""
            onChange={(e) => e.target.value && setDocs([...docs, e.target.value as DocumentType])}
            aria-label="Require a document"
          >
            <option value="">+ Document</option>
            {addable.map((d) => (
              <option key={d} value={d}>{DOCUMENT_LABELS[d]}</option>
            ))}
          </Select>
        )}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          className="size-4 accent-brand"
          checked={!!t.reasonRequired}
          disabled={!!t.defaults.reasonRequired}
          onChange={(e) => onChange({ reasonRequired: e.target.checked })}
        />
        Ask for a reason
        {t.defaults.reasonRequired && <span className="text-muted">(always for this action)</span>}
      </label>
    </li>
  );
}

function Switch({
  checked,
  onChange,
  title,
  detail,
  compact,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', compact ? 'shrink-0 items-center' : 'justify-between')}>
      <span className={cn('text-[13px]', compact && 'sr-only')}>
        {title}
        {detail && <span className="block text-[12px] text-muted">{detail}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-none bg-line transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-none bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
