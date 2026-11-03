'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CUSTOM_SLA_DEFAULT,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  FIRST_STAGE,
  LABEL_MAX,
  LAST_STAGE,
  SHORT_MAX,
  TEAMS,
  TEAM_LABELS,
  newCustomStageCode,
  normaliseWorkflowConfig,
  resolveWorkflow,
  workflowProblems,
  type CustomStage,
  type DocumentType,
  type ResolvedStage,
  type ResolvedTransition,
  type StageCode,
  type StageOverride,
  type TeamCode,
  type TransitionOverride,
  type WorkflowConfig,
} from '@udhay/shared';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Plus, Trash2, X } from 'lucide-react';
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
  usedStages: StageCode[];
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
  const problems = useMemo(() => workflowProblems(draft), [draft]);
  const dirty = !!data && !same(draft, data.config);

  const save = useMutation({
    mutationFn: () => api<WorkflowSettings>('/settings/workflow', { method: 'PUT', json: normaliseWorkflowConfig(draft) }),
    onSuccess: (res) => {
      qc.setQueryData(['settings-workflow'], res);
      qc.setQueryData(['workflow'], res.config);
      for (const key of ['projects', 'project', 'dashboard', 'queue', 'stage-slas']) qc.invalidateQueries({ queryKey: [key] });
      toast.success('Workflow saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;

  const order = wf.stages.map((s) => s.code);
  const used = new Set(data.usedStages);

  const setStage = (code: StageCode, patch: StageOverride) =>
    setDraft((d) => {
      // Added stages keep their name and team on the stage itself; switching off is an override like any other.
      const { enabled, ...rest } = patch;
      const custom = d.custom?.map((c) => (c.code === code ? { ...c, ...(rest as Partial<CustomStage>) } : c));
      const isCustom = !!d.custom?.some((c) => c.code === code);
      const override = isCustom ? (enabled === undefined ? undefined : { enabled }) : patch;
      return {
        ...d,
        custom,
        stages: override ? { ...d.stages, [code]: { ...d.stages[code], ...override } } : d.stages,
      };
    });
  const setTransition = (key: string, patch: TransitionOverride) =>
    setDraft((d) => ({ ...d, transitions: { ...d.transitions, [key]: { ...d.transitions[key], ...patch } } }));

  const move = (code: StageCode, by: -1 | 1) =>
    setDraft((d) => {
      const next = [...order];
      const i = next.indexOf(code);
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return { ...d, order: next };
    });

  const addAfter = (after: ResolvedStage) => {
    const code = newCustomStageCode(order);
    const stage: CustomStage = { code, label: 'New stage', short: 'New', team: after.team, slaHours: CUSTOM_SLA_DEFAULT };
    const next = [...order];
    next.splice(next.indexOf(after.code) + 1, 0, code);
    setDraft((d) => ({ ...d, custom: [...(d.custom ?? []), stage], order: next }));
    setOpen(code);
  };

  const remove = (code: StageCode) =>
    setDraft((d) => {
      const stages = { ...d.stages };
      delete stages[code];
      const transitions = Object.fromEntries(Object.entries(d.transitions).filter(([k]) => !k.startsWith(`${code}.`)));
      return {
        ...d,
        stages,
        transitions,
        custom: d.custom?.filter((c) => c.code !== code),
        order: order.filter((c) => c !== code),
      };
    });

  let step = 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Project workflow</h2>
        <p className="mt-1 text-[13px] text-muted">
          Add your own stages, change the order, rename stages and buttons, choose which team owns each stage, switch off
          stages you don&apos;t use, and decide which documents each step needs. Each step sends work on to the next stage in
          use. Projects already sitting in a stage you switch off can still finish it.
        </p>
        <p className="mt-2 text-[12px] text-muted">
          {wf.activeStages.length} of {wf.stages.length} stages in use · open a stage to edit it or to add a new one after it
        </p>
      </div>

      <ol className="divide-y">
        {wf.stages.map((s, i) => {
          if (s.enabled) step += 1;
          const count = data.activeProjects[s.code] ?? 0;
          const expanded = open === s.code;
          const pinned = s.code === FIRST_STAGE || s.code === LAST_STAGE;
          const canUp = !pinned && i > 1;
          const canDown = !pinned && i < wf.stages.length - 2;
          return (
            <li key={s.code} className={cn(!s.enabled && 'bg-surface/60')}>
              <div className="flex items-center hover:bg-surface">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s.code)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
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
                  {s.custom && <Badge tone="brand">Added</Badge>}
                  {count > 0 && <Badge tone="blue">{plural(count, 'project')}</Badge>}
                  {!s.enabled && <Badge>Off</Badge>}
                  <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />
                </button>
                <div className="flex shrink-0 items-center gap-0.5 px-2">
                  <IconButton label={`Move ${s.label} up`} disabled={!canUp} onClick={() => move(s.code, -1)}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton label={`Move ${s.label} down`} disabled={!canDown} onClick={() => move(s.code, 1)}>
                    <ArrowDown />
                  </IconButton>
                </div>
              </div>

              {expanded && (
                <StagePanel
                  stage={s}
                  raw={s.custom ? draft.custom?.find((c) => c.code === s.code) ?? {} : draft.stages[s.code] ?? {}}
                  draftTransitions={draft.transitions}
                  savedTeam={saved.index(s.code) >= 0 ? saved.stage(s.code).team : s.team}
                  count={count}
                  used={used.has(s.code)}
                  transitions={wf.allFrom(s.code)}
                  stageLabel={(code) => wf.stage(code).label}
                  onStage={(patch) => setStage(s.code, patch)}
                  onTransition={setTransition}
                  onAddAfter={s.code === LAST_STAGE ? undefined : () => addAfter(s)}
                  onRemove={() => {
                    remove(s.code);
                    setOpen(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-[57px] border-t bg-white/95 p-3 backdrop-blur md:bottom-0">
        {problems.length > 0 && (
          <ul className="mb-2 space-y-0.5 text-[12px] text-bad">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            disabled={same(draft, EMPTY)}
            onClick={() => {
              if (confirm('Go back to the built-in workflow? Added stages, the new order and renames will be cleared when you save.')) {
                setDraft(EMPTY);
              }
            }}
          >
            Built-in workflow
          </Button>
          <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(data.config)}>
            Undo changes
          </Button>
          <Button loading={save.isPending} disabled={!dirty || problems.length > 0} onClick={() => save.mutate()}>
            Save workflow
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StagePanel({
  stage,
  raw,
  draftTransitions,
  savedTeam,
  count,
  used,
  transitions,
  stageLabel,
  onStage,
  onTransition,
  onAddAfter,
  onRemove,
}: {
  stage: ResolvedStage;
  /** What was typed; a blank name falls back to the built-in one (shown as the placeholder). */
  raw: { label?: string; short?: string };
  draftTransitions: WorkflowConfig['transitions'];
  savedTeam: TeamCode;
  count: number;
  used: boolean;
  transitions: ResolvedTransition[];
  stageLabel: (code: StageCode) => string;
  onStage: (patch: StageOverride) => void;
  onTransition: (key: string, patch: TransitionOverride) => void;
  onAddAfter?: () => void;
  onRemove: () => void;
}) {
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
          <Select value={stage.team} disabled={stage.teamFixed} onChange={(e) => onStage({ team: e.target.value as TeamCode })}>
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
      {stage.custom && (
        <p className="-mt-2 text-[12px] text-muted">
          Target time starts at {stage.defaults.slaHours} hours; change it under Stage targets after saving.
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
              <TransitionRow
                key={t.key}
                t={t}
                rawLabel={draftTransitions[t.key]?.label}
                stageLabel={stageLabel}
                onChange={(patch) => onTransition(t.key, patch)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {onAddAfter && (
          <Button variant="secondary" size="sm" onClick={onAddAfter}>
            <Plus /> Add a stage after this
          </Button>
        )}
        {stage.custom &&
          (used ? (
            <span className="text-[12px] text-muted">Projects have been through this stage, so it can be switched off but not deleted.</span>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirm(`Delete the stage “${stage.label}”?`) && onRemove()}
            >
              <Trash2 /> Delete stage
            </Button>
          ))}
      </div>
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
        : 'Nowhere yet';

  return (
    <li className={cn('border bg-white p-3', !t.enabled && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn('size-2 shrink-0', t.tone === 'primary' ? 'bg-brand' : t.tone === 'danger' ? 'bg-bad' : 'bg-muted')}
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
          <span className="text-warn"> (instead of {stageLabel(t.defaults.to)})</span>
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

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center text-muted hover:bg-white hover:text-ink disabled:opacity-25 [&_svg]:size-4"
    >
      {children}
    </button>
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
