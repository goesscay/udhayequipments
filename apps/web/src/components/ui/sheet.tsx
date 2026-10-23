'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

/** Bottom sheet on mobile, centered dialog on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Room for tables (e.g. import previews). */
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`pb-safe relative w-full rounded-t-2xl bg-white shadow-xl md:rounded-2xl ${wide ? "max-w-4xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[78dvh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
