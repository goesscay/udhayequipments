'use client';

import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DirectoryUser {
  id: string;
  name: string;
  team: { code: string; name: string } | null;
}

/** Same token format the API parses: @[Display Name](userId) */
const TOKEN = /@\[([^\]\n]{1,120})\]\(([a-z0-9]{20,40})\)/g;

export function useDirectory() {
  return useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api<DirectoryUser[]>('/users/directory'),
    staleTime: 5 * 60_000,
  });
}

/** Renders stored comment text with mentions highlighted. */
export function MentionText({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className="rounded-none bg-brand-50 px-1 font-medium text-brand-600">
        @{m[1]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(body.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

/**
 * Textarea that suggests colleagues after "@". The visible text shows "@Name"; on send,
 * `toStored()` turns picked names into tokens the API can notify.
 */
export function MentionTextarea({
  value,
  onChange,
  picked,
  onPick,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  picked: Record<string, string>;
  onPick: (name: string, id: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const { data: users } = useDirectory();

  const matches = useMemo(() => {
    if (query === null || !users) return [];
    const q = query.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, users]);

  const detect = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(/(?:^|\s)@([\w .-]{0,30})$/);
    setQuery(m ? m[1] : null);
  };

  const pick = (u: DirectoryUser) => {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([\w .-]{0,30})$/, `@${u.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    onPick(u.name, u.id);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative flex-1">
      <Textarea
        ref={ref}
        rows={2}
        className="min-h-10"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery(null);
          if (e.key === 'Enter' && matches.length && query !== null) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border bg-white shadow-lg">
          {matches.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-surface', i === 0 && 'bg-surface')}
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-[11px] text-muted">{u.team?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {Object.keys(picked).length === 0 && !value && (
        <p className="mt-1 text-[11px] text-muted">Type @ to mention a colleague; they get a notification.</p>
      )}
    </div>
  );
}

/** Converts "@Name" for each picked person into the stored token. */
export function toStored(text: string, picked: Record<string, string>) {
  let out = text;
  for (const [name, id] of Object.entries(picked).sort((a, b) => b[0].length - a[0].length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`@${escaped}(?![\\w])`, 'g'), `@[${name}](${id})`);
  }
  return out;
}
