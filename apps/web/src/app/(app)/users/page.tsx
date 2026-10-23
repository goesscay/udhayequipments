'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Phone, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { ImportUsers } from '@/components/users/import-users';
import { UserForm, type UserRow } from '@/components/users/user-form';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<'create' | 'import' | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api<UserRow[]>('/users') });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['users', 'directory'] });
  };

  const toggle = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const teams = useMemo(() => [...new Set((users ?? []).map((u) => u.team?.name).filter(Boolean))].sort() as string[], [users]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (status === 'active' && !u.isActive) return false;
      if (status === 'inactive' && u.isActive) return false;
      if (team === '__none' ? !!u.team : team && u.team?.name !== team) return false;
      if (!term) return true;
      return [u.name, u.displayName, u.employeeCode, u.phone, u.email, u.department, u.role.name].some((v) =>
        v?.toLowerCase().includes(term),
      );
    });
  }, [users, q, team, status]);

  const canManage = can('user.manage');
  const editable = (u: UserRow) => canManage && (u.role.code !== 'SUPER_ADMIN' || me?.role.code === 'SUPER_ADMIN');

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={users ? `${users.filter((u) => u.isActive).length} active · ${users.length} total` : undefined}
        action={
          canManage && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSheet('import')}>
                <FileSpreadsheet /> <span className="hidden sm:inline">Import from Excel</span>
              </Button>
              <Button onClick={() => setSheet('create')}>
                <Plus /> <span className="hidden sm:inline">Add user</span>
              </Button>
            </div>
          )
        }
      />

      <div className="mb-4 space-y-2 md:flex md:gap-2 md:space-y-0">
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Name, code, mobile, department" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={team} onChange={(e) => setTeam(e.target.value)} className="w-auto min-w-36">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
            <option value="__none">No team</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto min-w-28">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !shown.length ? (
        <Card>
          <EmptyState title="No users match" hint={canManage ? 'Add people one by one or import your staff list from Excel.' : undefined} />
        </Card>
      ) : (
        <>
          {/* Phones: cards */}
          <Card className="divide-y md:hidden">
            {shown.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar u={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {u.displayName || u.name} {!u.isActive && <Badge className="ml-1">inactive</Badge>}
                    {u.isActive && u.mustChangePassword && <Badge tone="amber" className="ml-1">temp password</Badge>}
                  </p>
                  <p className="truncate text-[12px] text-muted">{[u.employeeCode, u.department, u.role.name].filter(Boolean).join(' · ')}</p>
                  {u.phone && (
                    <a href={`tel:${u.phone}`} className="inline-flex items-center gap-1 text-[12px] text-ink">
                      <Phone className="size-3" /> {u.phone}
                    </a>
                  )}
                </div>
                {editable(u) && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </Card>

          {/* Desktop: table */}
          <Card className="hidden overflow-x-auto no-scrollbar md:block">
            <table className="w-full min-w-[920px] text-[13px]">
              <thead className="border-b bg-surface text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Role · Team</th>
                  <th className="px-4 py-2.5 font-medium">Mobile</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 font-medium">Sign-in</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((u) => (
                  <tr key={u.id} className={u.isActive ? '' : 'bg-surface/60 text-muted'}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar u={u} />
                        <div className="min-w-0">
                          <p className="font-medium">
                            {u.displayName || u.name}
                            {u.employeeCode && <span className="ml-1.5 text-[11px] font-normal text-muted">{u.employeeCode}</span>}
                          </p>
                          <p className="text-[11px] text-muted">
                            {u.displayName ? u.name : u.email}
                            {u.gender && ` · ${u.gender}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.department ?? '—'}
                      {u.employmentType && <p className="text-[11px] text-muted">{u.employmentType}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.role.name}
                      <p className="text-[11px] text-muted">{u.team?.name ?? 'No team'}</p>
                    </td>
                    <td className="tabular px-4 py-2.5">{u.phone ?? '—'}</td>
                    <td className="px-4 py-2.5">{u.dateOfJoining ? formatDate(u.dateOfJoining) : '—'}</td>
                    <td className="px-4 py-2.5">
                      {!u.isActive ? (
                        <Badge>inactive</Badge>
                      ) : u.mustChangePassword ? (
                        <Badge tone="amber">temporary password</Badge>
                      ) : u.lastLoginAt ? (
                        <span className="text-[12px] text-muted">{formatDate(u.lastLoginAt)}</span>
                      ) : (
                        <span className="text-[12px] text-muted">never</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {editable(u) && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                            Edit
                          </Button>
                          {u.id !== me?.id && (
                            <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)} disabled={toggle.isPending}>
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Sheet open={sheet === 'create'} onClose={() => setSheet(null)} title="Add user">
        <UserForm
          onDone={() => {
            setSheet(null);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'import'} onClose={() => setSheet(null)} title="Import staff from Excel" wide>
        <ImportUsers onDone={refresh} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.displayName || editing?.name || 'user'}`}>
        {editing && (
          <>
            <UserForm
              key={editing.id}
              user={editing}
              onDone={() => {
                setEditing(null);
                refresh();
              }}
            />
            {editing.id !== me?.id && (
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => {
                  toggle.mutate(editing);
                  setEditing(null);
                }}
              >
                {editing.isActive ? 'Deactivate user' : 'Activate user'}
              </Button>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}

function Avatar({ u }: { u: UserRow }) {
  const label = (u.displayName || u.name)
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return <div className="grid size-9 shrink-0 place-items-center bg-surface text-[12px] font-semibold text-muted ring-1 ring-line">{label}</div>;
}
