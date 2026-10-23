'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

/** Refreshes the project (including its tabs and allowed actions) and the lists that show it. */
export function useProjectRefresh(projectId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
  }, [qc, projectId]);
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'ok' }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-none bg-surface ring-1 ring-line', className)}>
      <div
        className={cn('h-full rounded-none transition-all', tone === 'ok' ? 'bg-ok' : 'bg-brand')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'blue' | 'green'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-warn/10 text-warn',
    blue: 'bg-info/10 text-info',
    green: 'bg-ok/10 text-ok',
  };
  return <p className={cn('rounded-lg px-3 py-2 text-[13px]', tones[tone])}>{children}</p>;
}

/** Today as yyyy-mm-dd in local time, for <input type="date"> defaults. */
export function todayInput() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
