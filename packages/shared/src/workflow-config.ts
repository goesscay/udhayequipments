import { DOCUMENT_TYPES, type DocumentType } from './documents';
import { STAGES, STAGE_CODES, type StageCode, type StageDef } from './stages';
import { TEAMS, type TeamCode } from './teams';
import { TRANSITIONS, type TransitionDef, type WorkflowAction } from './workflow';

/**
 * Settings → Workflow. Admins can rename stages and actions, move a stage to another team,
 * switch optional stages and actions off, and change which documents and reasons each step needs.
 * Only the differences from the built-in workflow are stored, so later code changes still apply.
 */
export interface StageOverride {
  label?: string;
  short?: string;
  team?: TeamCode;
  enabled?: boolean;
}

export interface TransitionOverride {
  label?: string;
  enabled?: boolean;
  requiresDocuments?: DocumentType[];
  reasonRequired?: boolean;
}

export interface WorkflowConfig {
  stages: Partial<Record<StageCode, StageOverride>>;
  /** Keyed by `${from}.${action}`, e.g. "SITE_SURVEY.SUBMIT". */
  transitions: Record<string, TransitionOverride>;
}

export const EMPTY_WORKFLOW_CONFIG: WorkflowConfig = { stages: {}, transitions: {} };

/** Stages a company can leave out. The rest carry quotations, production or warranty and always run. */
export const SKIPPABLE_STAGES: readonly StageCode[] = [
  'SITE_SURVEY',
  'QUOTATION_SHARED',
  'LAYOUT_APPROVAL',
  'CAD_DRAWING',
  'HEAD_APPROVAL',
  'DISPATCH',
  'INSTALLATION',
];

/** Head Approval is decided by permission (cad.approve), not by a team, so its team is fixed. */
export const FIXED_TEAM_STAGES: readonly StageCode[] = ['HEAD_APPROVAL'];

/** Side paths (revisions, rejections, lost deals) that can be switched off. Main forward steps cannot. */
export const OPTIONAL_ACTIONS: readonly WorkflowAction[] = ['REQUEST_REVISION', 'REJECT', 'MARK_LOST'];

export const LABEL_MAX = 60;
export const SHORT_MAX = 16;

export const transitionKey = (t: { from: StageCode; action: WorkflowAction }) => `${t.from}.${t.action}`;

export interface ResolvedStage extends StageDef {
  enabled: boolean;
  skippable: boolean;
  teamFixed: boolean;
  /** Built-in values, for "reset" hints in the editor. */
  defaults: StageDef;
}

export interface ResolvedTransition extends TransitionDef {
  key: string;
  enabled: boolean;
  optional: boolean;
  /** Set when the step is unavailable for a reason other than being switched off. */
  disabledReason?: string;
  defaults: TransitionDef;
}

export interface ResolvedWorkflow {
  stages: ResolvedStage[];
  /** Stages a new project passes through, in order. */
  activeStages: ResolvedStage[];
  stage(code: StageCode): ResolvedStage;
  /** Every step out of a stage, including switched-off ones (for the editor). */
  allFrom(stage: StageCode): ResolvedTransition[];
  /** Steps people can actually take from a stage. */
  from(stage: StageCode): ResolvedTransition[];
  find(stage: StageCode, action: WorkflowAction): ResolvedTransition | undefined;
  /** Position in the full built-in order; used to tell forward from backward moves. */
  index(stage: StageCode): number;
  /** 1-based position among active stages, plus the total, for progress bars. */
  progress(stage: StageCode): { step: number; total: number };
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/** Drops unknown keys, defaults and junk so the stored config holds only real changes. */
export function normaliseWorkflowConfig(raw: unknown): WorkflowConfig {
  const out: WorkflowConfig = { stages: {}, transitions: {} };
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkflowConfig>;

  for (const def of STAGES) {
    const o = src.stages?.[def.code];
    if (!o || typeof o !== 'object') continue;
    const next: StageOverride = {};
    const label = clean(o.label, LABEL_MAX);
    const short = clean(o.short, SHORT_MAX);
    if (label && label !== def.label) next.label = label;
    if (short && short !== def.short) next.short = short;
    if (o.team && TEAMS.includes(o.team) && o.team !== def.team && !FIXED_TEAM_STAGES.includes(def.code)) {
      next.team = o.team;
    }
    if (o.enabled === false && SKIPPABLE_STAGES.includes(def.code)) next.enabled = false;
    if (Object.keys(next).length) out.stages[def.code] = next;
  }

  for (const def of TRANSITIONS) {
    const key = transitionKey(def);
    const o = src.transitions?.[key];
    if (!o || typeof o !== 'object') continue;
    const next: TransitionOverride = {};
    const label = clean(o.label, LABEL_MAX);
    if (label && label !== def.label) next.label = label;
    if (o.enabled === false && OPTIONAL_ACTIONS.includes(def.action)) next.enabled = false;
    if (Array.isArray(o.requiresDocuments)) {
      const docs = DOCUMENT_TYPES.filter((d) => o.requiresDocuments!.includes(d));
      const base = def.requiresDocuments ?? [];
      if (docs.length !== base.length || docs.some((d) => !base.includes(d))) next.requiresDocuments = docs;
    }
    // A step that needs a reason by default (lost, revision, rejection) always keeps it.
    if (o.reasonRequired === true && !def.reasonRequired) next.reasonRequired = true;
    if (Object.keys(next).length) out.transitions[key] = next;
  }
  return out;
}

export function resolveWorkflow(config: WorkflowConfig = EMPTY_WORKFLOW_CONFIG): ResolvedWorkflow {
  const stages: ResolvedStage[] = STAGES.map((def) => {
    const o = config.stages?.[def.code] ?? {};
    const skippable = SKIPPABLE_STAGES.includes(def.code);
    const teamFixed = FIXED_TEAM_STAGES.includes(def.code);
    return {
      ...def,
      label: o.label || def.label,
      short: o.short || def.short,
      team: (!teamFixed && o.team) || def.team,
      enabled: skippable ? o.enabled !== false : true,
      skippable,
      teamFixed,
      defaults: def,
    };
  });
  const byCode = Object.fromEntries(stages.map((s) => [s.code, s])) as Record<StageCode, ResolvedStage>;
  const index = (code: StageCode) => STAGE_CODES.indexOf(code);
  const activeStages = stages.filter((s) => s.enabled);

  const transitions: ResolvedTransition[] = TRANSITIONS.map((def) => {
    const key = transitionKey(def);
    const o = config.transitions?.[key] ?? {};
    const optional = OPTIONAL_ACTIONS.includes(def.action);
    let to = def.to;
    let disabledReason: string | undefined;
    if (to && !byCode[to].enabled) {
      if (index(to) > index(def.from)) {
        // Skipped stage ahead: go straight to the next stage that is still in use.
        to = stages.slice(index(to) + 1).find((s) => s.enabled)?.code ?? null;
      } else {
        disabledReason = `${byCode[to].label} is switched off`;
      }
    }
    return {
      ...def,
      key,
      to,
      label: o.label || def.label,
      requiresDocuments: o.requiresDocuments ?? def.requiresDocuments,
      reasonRequired: def.reasonRequired || o.reasonRequired === true,
      enabled: (optional ? o.enabled !== false : true) && !disabledReason,
      optional,
      disabledReason,
      defaults: def,
    };
  });

  return {
    stages,
    activeStages,
    stage: (code) => byCode[code],
    allFrom: (stage) => transitions.filter((t) => t.from === stage),
    from: (stage) => transitions.filter((t) => t.from === stage && t.enabled),
    find: (stage, action) => transitions.find((t) => t.from === stage && t.action === action && t.enabled),
    index,
    progress: (stage) => {
      const i = activeStages.findIndex((s) => s.code === stage);
      // A project still sitting in a stage that was switched off counts from where it would be.
      const step = i >= 0 ? i + 1 : activeStages.filter((s) => index(s.code) < index(stage)).length + 1;
      return { step, total: Math.max(activeStages.length, step) };
    },
  };
}

/** The built-in workflow, for code paths that run before the stored config is loaded. */
export const DEFAULT_WORKFLOW = resolveWorkflow();
