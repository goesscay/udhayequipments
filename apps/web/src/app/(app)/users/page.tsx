'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUserSchema, type CreateUserInput } from '@udhay/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: string; code: string; name: string };
  team: { id: string; code: string; name: string } | null;
}
interface Role { id: string; code: string; name: string }
interface Team { id: string; code: string; name: string }

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api<UserRow[]>('/users') });

  const toggle = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={users ? `${users.length} users` : undefined}
        action={
          can('user.manage') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add user
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !users?.length ? (
        <Card><EmptyState title="No users" /></Card>
      ) : (
        <Card className="divide-y">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-semibold text-muted ring-1 ring-line">
                {u.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {u.name} {!u.isActive && <Badge className="ml-1">inactive</Badge>}
                </p>
                <p className="truncate text-[12px] text-muted">
                  {u.email} · {u.role.name}
                  {u.team ? ` · ${u.team.name}` : ''}
                </p>
              </div>
              <span className="hidden text-[12px] text-muted md:block">
                {u.lastLoginAt ? `Last login ${formatDate(u.lastLoginAt)}` : 'Never logged in'}
              </span>
              {can('user.manage') && (u.role.code !== 'SUPER_ADMIN' || me?.role.code === 'SUPER_ADMIN') && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                  Edit
                </Button>
              )}
              {can('user.manage') && u.id !== me?.id && (
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)} disabled={toggle.isPending}>
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name ?? 'user'}`}>
        {editing && (
          <EditUserForm
            key={editing.id}
            user={editing}
            isSelf={editing.id === me?.id}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['users'] });
            }}
          />
        )}
      </Sheet>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Add user">
        <CreateUserForm
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      </Sheet>
    </>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const { user: me } = useAuth();
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api<Team[]>('/teams') });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema) });

  const create = useMutation({
    mutationFn: (v: CreateUserInput) =>
      api('/users', { method: 'POST', json: { ...v, phone: v.phone || undefined, teamId: v.teamId || undefined } }),
    onSuccess: () => {
      toast.success('User created');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
      <Field label="Full name" error={errors.name?.message}>
        <Input {...register('name')} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="off" {...register('email')} />
      </Field>
      <Field label="Phone (optional)" error={errors.phone?.message}>
        <Input type="tel" {...register('phone')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" error={errors.roleId?.message}>
          <Select {...register('roleId')}>
            <option value="">Choose…</option>
            {roles
              ?.filter((r) => r.code !== 'SUPER_ADMIN' || me?.role.code === 'SUPER_ADMIN')
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Team" error={errors.teamId?.message}>
          <Select {...register('teamId')}>
            <option value="">None</option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Temporary password" hint="10+ characters with a letter and a number" error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <Button type="submit" className="w-full" loading={create.isPending}>
        Create user
      </Button>
    </form>
  );
}

function EditUserForm({ user, isSelf, onDone }: { user: UserRow; isSelf: boolean; onDone: () => void }) {
  const { user: me } = useAuth();
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api<Team[]>('/teams') });
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [roleId, setRoleId] = useState(user.role.id);
  const [teamId, setTeamId] = useState(user.team?.id ?? '');
  const [password, setPassword] = useState('');
  const passwordOk = !password || /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/.test(password);

  const changes: Record<string, string> = {};
  if (name.trim() !== user.name) changes.name = name.trim();
  if (phone.trim() !== (user.phone ?? '')) changes.phone = phone.trim();
  if (roleId !== user.role.id) changes.roleId = roleId;
  if (teamId !== (user.team?.id ?? '')) changes.teamId = teamId;
  if (password) changes.password = password;

  const save = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'PATCH', json: changes }),
    onSuccess: () => {
      toast.success(changes.password ? 'User updated; they will need to sign in again' : 'User updated');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-[12px] text-muted">{user.email}</p>
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>
      <Field label="Phone">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={isSelf}>
            {roles
              ?.filter((r) => r.code !== 'SUPER_ADMIN' || me?.role.code === 'SUPER_ADMIN')
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Team">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">None</option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="New password (optional)"
        hint="Leave blank to keep the current one. Setting it signs the user out everywhere."
        error={passwordOk ? undefined : '10+ characters with a letter and a number'}
      >
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!Object.keys(changes).length || !passwordOk || !name.trim()}>
        Save changes
      </Button>
    </form>
  );
}
