'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { DEPARTMENTS, EMPLOYMENT_TYPES, GENDERS, mapDepartment } from '@udhay/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface UserRow {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  employeeCode: string | null;
  gender: string | null;
  department: string | null;
  employmentType: string | null;
  dateOfJoining: string | null;
  dateOfBirth: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; code: string; name: string };
  team: { id: string; code: string; name: string } | null;
}
interface Role { id: string; code: string; name: string }
interface Team { id: string; code: string; name: string }

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;

/** Create (no `user`) or edit a user, with every profile field. */
export function UserForm({ user, onDone }: { user?: UserRow; onDone: () => void }) {
  const { user: me } = useAuth();
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api<Team[]>('/teams') });
  const isSelf = user?.id === me?.id;

  const [f, setF] = useState({
    name: user?.name ?? '',
    displayName: user?.displayName ?? '',
    employeeCode: user?.employeeCode ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    gender: user?.gender ?? '',
    department: user?.department ?? '',
    employmentType: user?.employmentType ?? 'Full Time',
    dateOfJoining: day(user?.dateOfJoining ?? null),
    dateOfBirth: day(user?.dateOfBirth ?? null),
    roleId: user?.role.id ?? '',
    teamId: user?.team?.id ?? '',
    password: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  /** Picking a department pre-selects the usual team and role (still editable). */
  const pickDepartment = (department: string) => {
    const m = mapDepartment(department);
    setF((v) => ({
      ...v,
      department,
      teamId: m ? teams?.find((t) => t.code === m.team)?.id ?? '' : v.teamId,
      roleId: m && !user ? roles?.find((r) => r.code === m.role)?.id ?? v.roleId : v.roleId,
    }));
  };

  const passwordOk = user ? !f.password || PASSWORD_RULE.test(f.password) : PASSWORD_RULE.test(f.password);
  const hasLogin = !!(f.employeeCode.trim() || f.phone.trim() || f.email.trim());
  const valid = f.name.trim().length >= 2 && !!f.roleId && passwordOk && hasLogin;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        displayName: f.displayName.trim(),
        employeeCode: f.employeeCode.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        gender: f.gender,
        department: f.department.trim(),
        employmentType: f.employmentType,
        dateOfJoining: f.dateOfJoining,
        dateOfBirth: f.dateOfBirth,
        teamId: f.teamId,
      };
      if (!isSelf) body.roleId = f.roleId;
      if (f.password) body.password = f.password;
      return user ? api(`/users/${user.id}`, { method: 'PATCH', json: body }) : api('/users', { method: 'POST', json: body });
    },
    onSuccess: () => {
      toast.success(user ? (f.password ? 'Saved. They must set a new password at next sign-in.' : 'User updated') : 'User created. They set their own password at first sign-in.');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Employee code" hint="Used to sign in">
          <Input className="uppercase" value={f.employeeCode} onChange={set('employeeCode')} maxLength={30} placeholder="EMP025" />
        </Field>
        <Field label="Display name" hint="Short name shown in the app">
          <Input value={f.displayName} onChange={set('displayName')} maxLength={80} />
        </Field>
      </div>
      <Field label="Employee name">
        <Input value={f.name} onChange={set('name')} maxLength={120} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile number" hint="Can also be used to sign in">
          <Input type="tel" value={f.phone} onChange={set('phone')} maxLength={20} />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={f.email} onChange={set('email')} maxLength={160} />
        </Field>
        <Field label="Gender">
          <Select value={f.gender} onChange={set('gender')}>
            <option value="">Not set</option>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Employment type">
          <Select value={f.employmentType} onChange={set('employmentType')}>
            <option value="">Not set</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date of joining">
          <Input type="date" value={f.dateOfJoining} onChange={set('dateOfJoining')} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} />
        </Field>
      </div>
      <Field label="Department">
        <Input list="departments" value={f.department} onChange={(e) => pickDepartment(e.target.value)} maxLength={80} />
        <datalist id="departments">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}>
          <Select value={f.roleId} onChange={set('roleId')} disabled={isSelf}>
            <option value="">Choose…</option>
            {roles
              ?.filter((r) => r.code !== 'SUPER_ADMIN' || me?.role.code === 'SUPER_ADMIN')
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Team" hint="Workflow team, if any">
          <Select value={f.teamId} onChange={set('teamId')}>
            <option value="">None</option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label={user ? 'Reset password (optional)' : 'Temporary password'}
        hint={user ? 'Leave blank to keep it. A reset signs them out and they must choose a new one.' : '10+ characters with a letter and a number. They replace it at first sign-in.'}
        error={f.password && !passwordOk ? '10+ characters with a letter and a number' : undefined}
      >
        <Input type="text" autoComplete="off" spellCheck={false} value={f.password} onChange={set('password')} />
      </Field>
      {!hasLogin && <p className="text-[12px] text-bad">Give an employee code, mobile number or email so they can sign in.</p>}
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!valid}>
        {user ? 'Save changes' : 'Create user'}
      </Button>
    </form>
  );
}
