'use client';

import { useMutation } from '@tanstack/react-query';
import type { UserImportResult, UserImportRow } from '@udhay/shared';
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

type Result = UserImportResult & { dryRun: boolean };

/** Column headings accepted from the HR sheet (case, spaces and * don't matter). */
const HEADERS: Record<string, keyof UserImportRow> = {
  code: 'employeeCode',
  'employee code': 'employeeCode',
  'emp code': 'employeeCode',
  'employee name': 'name',
  name: 'name',
  'display name': 'displayName',
  'mobile number': 'phone',
  mobile: 'phone',
  phone: 'phone',
  gender: 'gender',
  'department name': 'department',
  department: 'department',
  status: 'status',
  'employment type': 'employmentType',
  'date of joining': 'dateOfJoining',
  doj: 'dateOfJoining',
  'date of birth': 'dateOfBirth',
  dob: 'dateOfBirth',
  email: 'email',
};

const DATE_FIELDS = new Set<keyof UserImportRow>(['dateOfJoining', 'dateOfBirth']);

function toCell(field: keyof UserImportRow, v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (DATE_FIELDS.has(field)) {
    // dd/mm/yyyy or dd-mm-yyyy as typed in India
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s || null;
}

async function parse(file: File): Promise<UserImportRow[]> {
  const data = (await readSheet(file)) as unknown[][];
  const headerAt = data.findIndex((r) => r.some((c) => typeof c === 'string' && HEADERS[c.replace(/\*/g, '').trim().toLowerCase()]));
  if (headerAt < 0) throw new Error('Could not find the heading row (Code, Employee Name, Department…)');
  const fields = data[headerAt].map((c) => (typeof c === 'string' ? HEADERS[c.replace(/\*/g, '').trim().toLowerCase()] : undefined));
  if (!fields.includes('employeeCode') || !fields.includes('name')) throw new Error('The sheet needs "Code" and "Employee Name" columns');
  return data
    .slice(headerAt + 1)
    .map((row) => {
      const out: Partial<UserImportRow> = {};
      fields.forEach((field, i) => {
        if (field) (out as Record<string, string | null>)[field] = toCell(field, row[i]);
      });
      return out;
    })
    .filter((r): r is UserImportRow => !!r.employeeCode && !!r.name);
}

function downloadCsv(result: UserImportResult) {
  const rows = [
    ['Employee code', 'Name', 'Display name', 'Sign in with', 'Temporary password', 'Role', 'Team', 'Mobile'],
    ...result.created.map((c) => [c.employeeCode, c.name, c.displayName ?? '', c.login, c.temporaryPassword, c.role, c.team ?? '', c.phone ?? '']),
  ];
  const csv = '﻿' + rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `udhay-temporary-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload the HR sheet → preview the mapping → create users → download their temporary passwords once. */
export function ImportUsers({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UserImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => api<Result>('/users/import', { method: 'POST', json: { rows, dryRun } }),
    onSuccess: (r) => {
      if (r.dryRun) setPreview(r);
      else {
        setDone(r);
        onDone();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const choose = async (file: File) => {
    try {
      const parsed = await parse(file);
      if (!parsed.length) throw new Error('No staff rows found under the headings');
      setFileName(file.name);
      setRows(parsed);
      setPreview(null);
      setDone(null);
      run.mutate(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (done) {
    const text = done.created.map((c) => `${c.employeeCode}\t${c.displayName ?? c.name}\t${c.temporaryPassword}`).join('\n');
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-[14px] font-medium text-ok">
          <CheckCircle2 className="size-5" /> {done.created.length} users created
          {done.skipped.length > 0 && <span className="text-[13px] font-normal text-muted">· {done.skipped.length} skipped</span>}
        </p>
        <p className="flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3 py-2 text-[13px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          These temporary passwords are shown only now. Download them, give each person theirs privately, and they will set their own at first sign-in.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadCsv(done)}>
            <Download /> Download passwords (CSV)
          </Button>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Copied'))}>
            <Copy /> Copy
          </Button>
        </div>
        <PasswordTable result={done} />
        {done.skipped.length > 0 && <Skipped result={done} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choose(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={run.isPending && !preview}>
          <FileSpreadsheet /> {fileName ? 'Choose another file' : 'Choose Excel file (.xlsx)'}
        </Button>
        {fileName && <span className="text-[13px] text-muted">{fileName} · {rows?.length ?? 0} rows</span>}
      </div>
      {!preview && (
        <p className="text-[13px] text-muted">
          Expected columns: Code, Employee Name, Display Name, Mobile number, Gender, Department Name, Status, Employment Type,
          Date of Joining, Date of Birth (Email optional). Department sets the team and starting role.
        </p>
      )}
      {preview && (
        <>
          <p className="text-[13px]">
            <span className="font-medium">{preview.created.length}</span> will be created
            {preview.skipped.length > 0 && <>, <span className="font-medium text-warn">{preview.skipped.length}</span> skipped</>}.
            Nothing is saved until you press Import.
          </p>
          <div className="max-h-[42dvh] overflow-auto border">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Code</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">Mobile</th>
                  <th className="px-2 py-1.5 font-medium">Role</th>
                  <th className="px-2 py-1.5 font-medium">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.created.map((c) => (
                  <tr key={c.employeeCode}>
                    <td className="px-2 py-1.5 font-medium">{c.employeeCode}</td>
                    <td className="px-2 py-1.5">
                      {c.name}
                      {c.displayName && <span className="text-muted"> · {c.displayName}</span>}
                    </td>
                    <td className="tabular px-2 py-1.5">{c.phone ?? '—'}</td>
                    <td className="px-2 py-1.5"><Badge tone="brand">{c.role}</Badge></td>
                    <td className="px-2 py-1.5">{c.team ?? <span className="text-muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.skipped.length > 0 && <Skipped result={preview} />}
          <Button className="w-full" loading={run.isPending} disabled={!preview.created.length} onClick={() => run.mutate(false)}>
            Import {preview.created.length} users
          </Button>
        </>
      )}
    </div>
  );
}

function PasswordTable({ result }: { result: UserImportResult }) {
  return (
    <div className="max-h-[40dvh] overflow-auto border">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead className="sticky top-0 bg-surface text-left text-muted">
          <tr>
            <th className="px-2 py-1.5 font-medium">Sign in with</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 font-medium">Temporary password</th>
            <th className="px-2 py-1.5 font-medium">Role · Team</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.created.map((c) => (
            <tr key={c.employeeCode}>
              <td className="px-2 py-1.5 font-medium">{c.login}</td>
              <td className="px-2 py-1.5">{c.displayName ?? c.name}</td>
              <td className="px-2 py-1.5 font-mono text-[13px]">{c.temporaryPassword}</td>
              <td className="px-2 py-1.5 text-muted">{c.role}{c.team ? ` · ${c.team}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skipped({ result }: { result: UserImportResult }) {
  return (
    <div className="border border-warn/30 bg-warn/5 p-3 text-[12px]">
      <p className="mb-1 font-medium text-warn">Skipped</p>
      <ul className="space-y-0.5">
        {result.skipped.map((s) => (
          <li key={s.employeeCode + s.reason}>
            <span className="font-medium">{s.employeeCode}</span> {s.name}: {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
