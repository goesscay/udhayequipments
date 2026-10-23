import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function formatINR(value: number | null | undefined, compact = false) {
  if (value == null) return '—';
  if (compact) {
    if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
    if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`;
  }
  return inr.format(value);
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type Rag = 'green' | 'amber' | 'red' | 'none';

/** Red when overdue, amber when less than 25% of the SLA window (or under 12h) is left. */
export function ragStatus(startedAt: string | null, dueAt: string | null): Rag {
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  if (now > due) return 'red';
  const start = startedAt ? new Date(startedAt).getTime() : now;
  const left = due - now;
  return left < Math.max((due - start) * 0.25, 0) || left < 12 * 3_600_000 ? 'amber' : 'green';
}

export function dueLabel(dueAt: string | null) {
  if (!dueAt) return '';
  const diffH = Math.round((new Date(dueAt).getTime() - Date.now()) / 3_600_000);
  if (diffH < 0) {
    const late = -diffH;
    return late >= 24 ? `${Math.round(late / 24)}d overdue` : `${late}h overdue`;
  }
  return diffH >= 24 ? `due in ${Math.round(diffH / 24)}d` : `due in ${diffH}h`;
}

export const humanize = (s: string) =>
  s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
