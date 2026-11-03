'use client';

import { useQuery } from '@tanstack/react-query';
import { forwardRef, useEffect, useState } from 'react';
import type { Customer } from '@/components/customer-form';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';

/**
 * Text input that suggests existing customers as you type (name, phone or city).
 * Typing a new name still works: the caller creates a customer when nothing is picked.
 */
export const CustomerSuggest = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { value: string; enabled: boolean; onPick: (c: Customer) => void }
>(({ value, enabled, onPick, onBlur, onFocus, onKeyDown, ...props }, ref) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'suggest', term],
    queryFn: () => api<Customer[]>(`/customers?q=${encodeURIComponent(term)}`),
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
  });
  const matches = term.length >= 2 ? (data ?? []).slice(0, 8) : [];
  const show = open && matches.length > 0;

  const pick = (c: Customer) => {
    setOpen(false);
    onPick(c);
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        value={value}
        {...props}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Let a click on a suggestion land before closing.
          setTimeout(() => setOpen(false), 150);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (show && e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (show && e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (show && e.key === 'Enter') {
            e.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          } else {
            setOpen(true);
            setActive(0);
          }
          onKeyDown?.(e);
        }}
      />
      {show && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-surface' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <p className="text-[14px] font-medium text-ink">{c.name}</p>
              <p className="text-[12px] text-muted">
                {[c.contactPerson, c.phone, c.city].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
          {isFetching && <li className="px-3 py-1 text-[12px] text-muted">Searching…</li>}
        </ul>
      )}
    </div>
  );
});
CustomerSuggest.displayName = 'CustomerSuggest';
