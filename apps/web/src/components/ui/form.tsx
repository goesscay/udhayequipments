import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border bg-white px-3 text-[15px] md:text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 disabled:bg-surface';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, 'h-10', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(control, 'min-h-[88px] py-2', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(control, 'h-10 pr-8', className)} {...props} />,
);
Select.displayName = 'Select';

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-bad">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
