'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS, PERMISSION_KEYS, type PermissionKey, type Scope } from '@udhay/shared';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: { key: PermissionKey; scope: Scope }[];
}

type Grants = Partial<Record<PermissionKey, Scope>>;

const GROUPS: { label: string; prefix: string[] }[] = [
  { label: 'Projects & workflow', prefix: ['dashboard', 'project', 'stage', 'cad'] },
  { label: 'Documents & customers', prefix: ['document', 'customer', 'price'] },
  { label: 'Administration', prefix: ['user', 'role', 'settings', 'audit'] },
];

const CHOICES: { value: Scope | null; label: string; hint: string }[] = [
  { value: null, label: 'None', hint: 'No access' },
  { value: 'OWN', label: 'Own', hint: 'Only records assigned to or created by the user' },
  { value: 'TEAM', label: 'Team', hint: "The user's department" },
  { value: 'ALL', label: 'All', hint: 'Every record' },
];

export function RolesEditor() {
  const qc = useQueryClient();
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = roles?.find((r) => r.id === selectedId) ?? roles?.[0];

  if (isLoading || !roles) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto no-scrollbar px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                'shrink-0 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-colors lg:w-full',
                selected?.id === r.id ? 'border-brand/40 bg-brand-50/60' : 'hover:border-brand/20',
              )}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {r.code === 'SUPER_ADMIN' && <Lock className="size-3 text-muted" />}
                {r.name}
              </span>
              <span className="block text-[11px] text-muted">
                {r.userCount} user{r.userCount === 1 ? '' : 's'}
                {!r.isSystem && ' · custom'}
              </span>
            </button>
          ))}
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
          <Plus /> New role
        </Button>
      </div>

      {selected && (
        <RoleMatrix
          key={selected.id}
          role={selected}
          onSaved={() => qc.invalidateQueries({ queryKey: ['roles'] })}
          onDeleted={() => {
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New role">
        <CreateRoleForm
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      </Sheet>
    </div>
  );
}

function RoleMatrix({ role, onSaved, onDeleted }: { role: Role; onSaved: () => void; onDeleted: () => void }) {
  const locked = role.code === 'SUPER_ADMIN';
  const initial = useMemo<Grants>(
    () => Object.fromEntries(role.permissions.map((p) => [p.key, p.scope])),
    [role.permissions],
  );
  const [grants, setGrants] = useState<Grants>(initial);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  useEffect(() => setGrants(initial), [initial]);

  const dirtyGrants = PERMISSION_KEYS.some((k) => (grants[k] ?? null) !== (initial[k] ?? null));
  const dirtyInfo = name.trim() !== role.name || description.trim() !== (role.description ?? '');

  const save = useMutation({
    mutationFn: async () => {
      if (dirtyInfo) {
        await api(`/roles/${role.id}`, { method: 'PATCH', json: { name: name.trim(), description: description.trim() } });
      }
      if (dirtyGrants) {
        const permissions = Object.entries(grants)
          .filter(([, scope]) => scope)
          .map(([key, scope]) => ({ key, scope }));
        await api(`/roles/${role.id}/permissions`, { method: 'PUT', json: { permissions } });
      }
    },
    onSuccess: () => {
      toast.success(`${name.trim() || role.name} saved`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api(`/roles/${role.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Role deleted');
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b p-4">
        {locked ? (
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Lock className="size-4 text-muted" /> {role.name}
            </h2>
            <p className="mt-1 text-[13px] text-muted">The Super Admin role always has full access and cannot be edited.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Role name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
            </Field>
          </div>
        )}
        <p className="text-[12px] text-muted">
          <span className="font-medium text-ink">Own</span> = records assigned to or created by the user ·{' '}
          <span className="font-medium text-ink">Team</span> = their department ·{' '}
          <span className="font-medium text-ink">All</span> = everything
        </p>
      </div>

      {GROUPS.map((group) => {
        const keys = PERMISSION_KEYS.filter((k) => group.prefix.includes(k.split('.')[0]));
        return (
          <section key={group.label}>
            <h3 className="bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.label}</h3>
            <ul className="divide-y">
              {keys.map((key) => (
                <li key={key} className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px]">{PERMISSIONS[key]}</p>
                    <p className="font-mono text-[10px] text-muted">{key}</p>
                  </div>
                  <ScopePicker
                    value={grants[key] ?? null}
                    disabled={locked}
                    onChange={(scope) => setGrants((g) => ({ ...g, [key]: scope ?? undefined }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!locked && (
        <div className="sticky bottom-[57px] flex flex-wrap items-center gap-2 border-t bg-white/95 p-3 backdrop-blur md:bottom-0">
          {!role.isSystem && (
            <Button
              variant="ghost"
              className="text-bad"
              loading={remove.isPending}
              disabled={role.userCount > 0}
              title={role.userCount > 0 ? 'Move its users to another role first' : undefined}
              onClick={() => confirm(`Delete the role "${role.name}"?`) && remove.mutate()}
            >
              <Trash2 /> Delete role
            </Button>
          )}
          {role.userCount > 0 && (dirtyGrants || dirtyInfo) && (
            <Badge tone="amber">Affects {role.userCount} user{role.userCount === 1 ? '' : 's'} immediately</Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              disabled={!dirtyGrants && !dirtyInfo}
              onClick={() => {
                setGrants(initial);
                setName(role.name);
                setDescription(role.description ?? '');
              }}
            >
              Reset
            </Button>
            <Button loading={save.isPending} disabled={(!dirtyGrants && !dirtyInfo) || !name.trim()} onClick={() => save.mutate()}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ScopePicker({
  value,
  disabled,
  onChange,
}: {
  value: Scope | null;
  disabled?: boolean;
  onChange: (scope: Scope | null) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border bg-surface p-0.5" role="radiogroup">
      {CHOICES.map((c) => (
        <button
          key={c.label}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          title={c.hint}
          disabled={disabled}
          onClick={() => onChange(c.value)}
          className={cn(
            'min-w-12 rounded-md px-2.5 py-1 text-[12px] font-medium text-muted transition-colors disabled:cursor-not-allowed',
            value === c.value && (c.value ? 'bg-white text-brand-600 shadow-sm' : 'bg-white text-ink shadow-sm'),
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function CreateRoleForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const code = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const valid = /^[A-Z][A-Z0-9_]{2,39}$/.test(code);

  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/roles', { method: 'POST', json: { code, name: name.trim(), description: description.trim() || undefined } }),
    onSuccess: (r) => {
      toast.success('Role created. Now choose its permissions.');
      onCreated(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) create.mutate();
      }}
    >
      <Field label="Role name" hint={code ? `Code: ${code}` : 'e.g. Accounts Executive'} error={name && !valid ? 'Use at least 3 letters, starting with a letter' : undefined}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Description (optional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
      </Field>
      <Button type="submit" className="w-full" loading={create.isPending} disabled={!valid}>
        Create role
      </Button>
    </form>
  );
}
