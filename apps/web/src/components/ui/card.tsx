import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border bg-white', className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b px-4 py-3', className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

const tones = {
  neutral: 'bg-surface text-muted border-line',
  brand: 'bg-brand-50 text-brand-600 border-brand/20',
  green: 'bg-ok/10 text-ok border-ok/20',
  amber: 'bg-warn/10 text-warn border-warn/20',
  red: 'bg-bad/10 text-bad border-bad/20',
  blue: 'bg-info/10 text-info border-info/20',
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/70', className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}
