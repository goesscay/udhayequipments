import type { StageCode } from '@udhay/shared';

/** Stages with no meaningful deadline (service runs for the whole warranty period). */
export const SLA_EXEMPT_STAGES: StageCode[] = ['SERVICE'];

/** 0 = fine, 1 = due soon, 2 = overdue, 3 = overdue long enough to escalate to management. */
export type SlaLevel = 0 | 1 | 2 | 3;

export interface SlaConfig {
  dueSoonHours: number;
  escalateAfterHours: number;
}

const HOUR = 3_600_000;

export function slaLevelFor(dueAt: Date, now: Date, cfg: SlaConfig): SlaLevel {
  const hoursLeft = (dueAt.getTime() - now.getTime()) / HOUR;
  if (hoursLeft > cfg.dueSoonHours) return 0;
  if (hoursLeft > 0) return 1;
  if (-hoursLeft < cfg.escalateAfterHours) return 2;
  return 3;
}

export function formatDuration(ms: number): string {
  const hours = Math.max(1, Math.round(Math.abs(ms) / HOUR));
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
