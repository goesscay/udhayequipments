import { DOCUMENT_TYPES, type DocumentType } from './documents';
import { RETIRED_STAGES, STAGES, STAGE_CODES, stageIndex, type BuiltinStageCode, type StageCode, type StageDef } from './stages';
import { TEAMS, type TeamCode } from './teams';
import { TRANSITIONS, type TransitionDef, type WorkflowAction } from './workflow';

/**
 * Settings → Workflow. Admins can rename stages and actions, move a stage to another team, add their
 * own stages, put stages in a different order, switch optional stages and actions off, and change
 * which documents and reasons each step needs. Only the differences from the built-in workflow are
 * stored, so later code changes still apply.
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

/** A stage added in Settings → Workflow. It has a "send on" step and an optional "send back" step. */
export interface CustomStage {
  code: StageCode;
  label: string;
  short: string;
  team: TeamCode;
  /** Default target time; Settings → Stage targets can override it like any other stage. */
  slaHours: number;
}

export interface WorkflowConfig {
  stages: Partial<Record<StageCode, StageOverride>>;
  /** Keyed by `${from}.${action}`, e.g. "SITE_SURVEY.SUBMIT". */
  transitions: Record<string, TransitionOverride>;
  custom?: CustomStage[];
  /** Every stage code in the order projects move through them. Missing when the built-in order is used. */
  order?: StageCode[];
}

export const EMPTY_WORKFLOW_CONFIG: WorkflowConfig = { stages: {}, transitions: {} };

/** Built-in stages a company can leave out. The rest carry quotations, production or warranty and always run. */
export const SKIPPABLE_STAGES: readonly StageCode[] = [
  'LAYOUT_DRAWING',
  'LAYOUT_APPROVAL',
  'SITE_SURVEY',
  'CAD_DRAWING',
  'HEAD_APPROVAL',
  'CAD_RELEASE',
  'QC',
  'DISPATCH',
];

/** MEP Layout Approval is decided by permission (cad.approve), not by a team, so its team is fixed. */
export const FIXED_TEAM_STAGES: readonly StageCode[] = ['HEAD_APPROVAL'];

/** Side paths (revisions, rejections, lost deals) that can be switched off. Main forward steps cannot. */
export const OPTIONAL_ACTIONS: readonly WorkflowAction[] = ['REQUEST_REVISION', 'REJECT', 'MARK_LOST'];

/**
 * Built-in stages that must stay in this order, because later ones use what earlier ones produce
 * (a quotation before the customer approves it, a BOQ before production, goods checked before they
 * are delivered). Lead is always first and Service always last.
 */
export const ORDER_RULES: readonly [BuiltinStageCode, BuiltinStageCode][] = [
  ['LAYOUT_DRAWING', 'LAYOUT_APPROVAL'],
  ['QUOTATION_PREP', 'CUSTOMER_DECISION'],
  ['CUSTOMER_DECISION', 'BOQ_DRAWING'],
  ['BOQ_DRAWING', 'PRODUCTION'],
  ['CAD_DRAWING', 'HEAD_APPROVAL'],
  ['HEAD_APPROVAL', 'CAD_RELEASE'],
  ['CAD_RELEASE', 'PRODUCTION'],
  ['PRODUCTION', 'QC'],
  ['QC', 'DISPATCH'],
  ['DISPATCH', 'INSTALLATION'],
];

export const FIRST_STAGE: StageCode = 'LEAD';
export const LAST_STAGE: StageCode = 'SERVICE';

export const LABEL_MAX = 60;
export const SHORT_MAX = 16;
export const MAX_CUSTOM_STAGES = 30;
export const CUSTOM_SLA_DEFAULT = 48;
export const CUSTOM_CODE_PATTERN = /^X_[A-Z0-9]{4,12}$/;

export const isCustomStage = (code: StageCode) => CUSTOM_CODE_PATTERN.test(code);
export const transitionKey = (t: { from: StageCode; action: WorkflowAction }) => `${t.from}.${t.action}`;

/** A fresh code for a new stage, e.g. "X_7KQ2MD". */
export function newCustomStageCode(taken: Iterable<StageCode> = []): StageCode {
  const used = new Set(taken);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = 'X_';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!used.has(code)) return code;
  }
}

export interface ResolvedStage extends StageDef {
  enabled: boolean;
  skippable: boolean;
  teamFixed: boolean;
  custom: boolean;
  /** Built-in values (or the values the stage was added with), for "reset" hints in the editor. */
  defaults: StageDef;
}

export interface ResolvedTransition extends TransitionDef {
  key: string;
  enabled: boolean;
  optional: boolean;
  /** Set when the step is unavailable for a reason other than being switched off. */
  disabledReason?: string;
  defaults: TransitionDef & { enabled: boolean };
}

export interface ResolvedWorkflow {
  /** Every stage in the configured order, including switched-off ones. */
  stages: ResolvedStage[];
  /** Stages a new project passes through, in order. */
  activeStages: ResolvedStage[];
  stage(code: StageCode): ResolvedStage;
  /** Every step out of a stage, including switched-off ones (for the editor). */
  allFrom(stage: StageCode): ResolvedTransition[];
  /** Steps people can actually take from a stage. */
  from(stage: StageCode): ResolvedTransition[];
  find(stage: StageCode, action: WorkflowAction): ResolvedTransition | undefined;
  /** Position in the configured order; used to tell forward from backward moves. */
  index(stage: StageCode): number;
  /** 1-based position among active stages, plus the total, for progress bars. */
  progress(stage: StageCode): { step: number; total: number };
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/** Transitions a custom stage gets: send on (always) and send back (off until switched on). */
function customTransitions(code: StageCode): (TransitionDef & { enabled: boolean })[] {
  return [
    { from: code, action: 'SUBMIT', label: '', to: null, permission: 'stage.act', teamBound: true, tone: 'primary', enabled: true },
    {
      from: code,
      action: 'REQUEST_REVISION',
      label: '',
      to: null,
      permission: 'stage.act',
      teamBound: true,
      reasonRequired: true,
      tone: 'neutral',
      enabled: false,
    },
  ];
}

function baseTransitions(custom: CustomStage[]) {
  return [
    ...TRANSITIONS.map((t) => ({ ...t, enabled: true })),
    ...custom.flatMap((c) => customTransitions(c.code)),
  ];
}

/**
 * Puts every known stage in the stored order, dropping unknown codes and adding any missing
 * built-in stage after the stage before it in the built-in order.
 */
function sanitiseOrder(order: unknown, custom: CustomStage[]): StageCode[] {
  const known = new Set<StageCode>([...STAGE_CODES, ...custom.map((c) => c.code)]);
  const out: StageCode[] = [];
  if (Array.isArray(order)) {
    for (const code of order) if (typeof code === 'string' && known.has(code) && !out.includes(code)) out.push(code);
  }
  STAGE_CODES.forEach((code, i) => {
    if (out.includes(code)) return;
    // After the built-in stage before it, and after any added stages placed right behind that one.
    let at = i === 0 ? 0 : out.indexOf(STAGE_CODES[i - 1]) + 1;
    while (i > 0 && at < out.length && isCustomStage(out[at])) at++;
    out.splice(at, 0, code);
  });
  for (const c of custom) {
    if (!out.includes(c.code)) out.splice(Math.max(0, out.indexOf(LAST_STAGE)), 0, c.code);
  }
  return out;
}

const sameOrder = (a: StageCode[], b: readonly StageCode[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** Drops unknown keys, defaults and junk so the stored config holds only real changes. */
export function normaliseWorkflowConfig(raw: unknown): WorkflowConfig {
  const out: WorkflowConfig = { stages: {}, transitions: {} };
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkflowConfig>;

  const custom: CustomStage[] = [];
  if (Array.isArray(src.custom)) {
    for (const c of src.custom) {
      if (custom.length >= MAX_CUSTOM_STAGES) break;
      if (!c || typeof c.code !== 'string' || !isCustomStage(c.code) || custom.some((x) => x.code === c.code)) continue;
      const label = clean(c.label, LABEL_MAX) || 'New stage';
      const sla = Number(c.slaHours);
      custom.push({
        code: c.code,
        label,
        short: clean(c.short, SHORT_MAX) || label.slice(0, SHORT_MAX),
        team: TEAMS.includes(c.team) ? c.team : 'MANAGEMENT',
        slaHours: Number.isInteger(sla) && sla >= 1 && sla <= 17_520 ? sla : CUSTOM_SLA_DEFAULT,
      });
    }
  }
  if (custom.length) out.custom = custom;

  const order = sanitiseOrder(src.order, custom);
  if (!sameOrder(order, sanitiseOrder(undefined, custom))) out.order = order;

  const defs: StageDef[] = [...STAGES, ...custom];
  for (const def of defs) {
    const o = src.stages?.[def.code];
    if (!o || typeof o !== 'object') continue;
    const isCustom = isCustomStage(def.code);
    const next: StageOverride = {};
    // Custom stages keep their name and team on the stage itself; only on/off is an override.
    if (!isCustom) {
      const label = clean(o.label, LABEL_MAX);
      const short = clean(o.short, SHORT_MAX);
      if (label && label !== def.label) next.label = label;
      if (short && short !== def.short) next.short = short;
      if (o.team && TEAMS.includes(o.team) && o.team !== def.team && !FIXED_TEAM_STAGES.includes(def.code)) {
        next.team = o.team;
      }
    }
    if (o.enabled === false && (isCustom || SKIPPABLE_STAGES.includes(def.code))) next.enabled = false;
    if (Object.keys(next).length) out.stages[def.code] = next;
  }

  for (const def of baseTransitions(custom)) {
    const key = transitionKey(def);
    const o = src.transitions?.[key];
    if (!o || typeof o !== 'object') continue;
    const next: TransitionOverride = {};
    const label = clean(o.label, LABEL_MAX);
    if (label && label !== def.label) next.label = label;
    const optional = OPTIONAL_ACTIONS.includes(def.action);
    if (optional && typeof o.enabled === 'boolean' && o.enabled !== def.enabled) next.enabled = o.enabled;
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

/** Problems that make a config unusable (shown in the editor; the API refuses to save them). */
export function workflowProblems(config: WorkflowConfig): string[] {
  const wf = resolveWorkflow(config);
  const problems: string[] = [];
  const codes = wf.stages.map((s) => s.code);
  if (codes[0] !== FIRST_STAGE) problems.push(`${wf.stage(FIRST_STAGE).label} must be the first stage.`);
  if (codes[codes.length - 1] !== LAST_STAGE) problems.push(`${wf.stage(LAST_STAGE).label} must be the last stage.`);
  for (const [a, b] of ORDER_RULES) {
    if (wf.index(a) > wf.index(b)) problems.push(`${wf.stage(a).label} has to come before ${wf.stage(b).label}.`);
  }
  return problems;
}

function fallbackStage(code: StageCode): ResolvedStage {
  // A stage that was removed from the workflow but still appears in old history.
  const retired = RETIRED_STAGES[code];
  const def: StageDef = {
    code,
    label: retired?.label ?? code,
    short: retired?.short ?? code.slice(0, SHORT_MAX),
    team: 'MANAGEMENT',
    slaHours: CUSTOM_SLA_DEFAULT,
  };
  return { ...def, enabled: false, skippable: true, teamFixed: false, custom: true, defaults: def };
}

export function resolveWorkflow(config: WorkflowConfig = EMPTY_WORKFLOW_CONFIG): ResolvedWorkflow {
  const custom = config.custom ?? [];
  const defs = new Map<StageCode, StageDef>([...STAGES, ...custom].map((d) => [d.code, d]));
  const order = sanitiseOrder(config.order, custom);

  const stages: ResolvedStage[] = order.map((code) => {
    const def = defs.get(code)!;
    const o = config.stages?.[code] ?? {};
    const isCustom = isCustomStage(code);
    const skippable = isCustom || SKIPPABLE_STAGES.includes(code);
    const teamFixed = FIXED_TEAM_STAGES.includes(code);
    return {
      ...def,
      label: (!isCustom && o.label) || def.label,
      short: (!isCustom && o.short) || def.short,
      team: (!isCustom && !teamFixed && o.team) || def.team,
      enabled: skippable ? o.enabled !== false : true,
      skippable,
      teamFixed,
      custom: isCustom,
      defaults: def,
    };
  });
  const byCode = new Map(stages.map((s) => [s.code, s]));
  const stage = (code: StageCode) => byCode.get(code) ?? fallbackStage(code);
  const index = (code: StageCode) => order.indexOf(code);
  const activeStages = stages.filter((s) => s.enabled);
  const nextActive = (from: StageCode) => stages.slice(index(from) + 1).find((s) => s.enabled) ?? null;
  const prevActive = (from: StageCode) =>
    stages
      .slice(0, Math.max(0, index(from)))
      .reverse()
      .find((s) => s.enabled) ?? null;

  const transitions: ResolvedTransition[] = baseTransitions(custom).map((base) => {
    const key = transitionKey(base);
    const o = config.transitions?.[key] ?? {};
    const optional = OPTIONAL_ACTIONS.includes(base.action);
    const isCustom = isCustomStage(base.from);
    // Main forward steps always lead to the next stage in use; return paths keep their fixed target.
    const forward = isCustom ? base.action === 'SUBMIT' : !!base.to && stageIndex(base.to) > stageIndex(base.from);
    let to: StageCode | null = base.to;
    let disabledReason: string | undefined;
    let label = base.label;

    if (forward) {
      to = nextActive(base.from)?.code ?? null;
      if (!to) disabledReason = 'there is no stage after this one';
      if (isCustom) label = to ? `Send to ${stage(to).label}` : 'Send on';
      else if (to && to !== base.to && base.action === 'SUBMIT') label = `Send to ${stage(to).label}`;
    } else if (isCustom) {
      const prev = prevActive(base.from);
      to = prev?.code ?? null;
      label = prev ? `Send back to ${prev.label}` : 'Send back';
      if (!prev) disabledReason = 'there is no stage before this one';
    } else if (to) {
      if (!stage(to).enabled) disabledReason = `${stage(to).label} is switched off`;
      else if (index(to) > index(base.from)) disabledReason = `${stage(to).label} now comes after this stage`;
    }

    const switchedOn = optional ? (o.enabled ?? base.enabled) : true;
    return {
      ...base,
      key,
      to,
      label: o.label || label,
      requiresDocuments: o.requiresDocuments ?? base.requiresDocuments,
      reasonRequired: base.reasonRequired || o.reasonRequired === true,
      enabled: switchedOn && !disabledReason,
      optional,
      disabledReason,
      defaults: { ...base, to: base.to, label },
    };
  });

  return {
    stages,
    activeStages,
    stage,
    allFrom: (from) => transitions.filter((t) => t.from === from),
    from: (from) => transitions.filter((t) => t.from === from && t.enabled),
    find: (from, action) => transitions.find((t) => t.from === from && t.action === action && t.enabled),
    index,
    progress: (code) => {
      const i = activeStages.findIndex((s) => s.code === code);
      // A project still sitting in a stage that was switched off counts from where it would be.
      const step = i >= 0 ? i + 1 : activeStages.filter((s) => index(s.code) < index(code)).length + 1;
      return { step, total: Math.max(activeStages.length, step) };
    },
  };
}

/** The built-in workflow, for code paths that run before the stored config is loaded. */
export const DEFAULT_WORKFLOW = resolveWorkflow();
