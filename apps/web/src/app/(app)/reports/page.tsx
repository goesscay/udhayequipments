'use client';

import { useQuery } from '@tanstack/react-query';
import { STAGE_BY_CODE, TEAM_LABELS, type ReportSummary } from '@udhay/shared';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, formatINR } from '@/lib/utils';

// Validated pair (dataviz validator: lightness, chroma, CVD and contrast all pass on white).
const SERIES_A = '#B8862B';
const SERIES_B = '#3D6FD6';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
] as const;

const EXPORTS = [
  { kind: 'projects', label: 'Projects' },
  { kind: 'stage-durations', label: 'Stage times' },
  { kind: 'payments', label: 'Payments', price: true },
  { kind: 'tickets', label: 'Service tickets' },
] as const;

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

const hours = (h: number | null) => (h == null ? '—' : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);

export default function ReportsPage() {
  const { can } = useAuth();
  const [days, setDays] = useState<number>(90);
  const range = (() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  })();
  const qs = `from=${range.from}&to=${range.to}`;

  const { data, isLoading } = useQuery({
    queryKey: ['reports', qs],
    queryFn: () => api<ReportSummary>(`/reports/summary?${qs}`),
  });

  const download = async (kind: string) => {
    try {
      const blob = await api<Blob>(`/reports/export/${kind}?${qs}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `udhay-${kind}-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const showMoney = can('price.view');
  const monthly = data?.monthly.map((m) => ({ ...m, label: monthLabel(m.month) })) ?? [];

  return (
    <>
      <PageHeader title="Reports" subtitle={data ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : undefined} />

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-lg border bg-white p-1 text-[13px] md:w-fit">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn('shrink-0 rounded-md px-3 py-1.5 font-medium', days === r.days ? 'bg-brand-50 text-brand-600' : 'text-muted')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXPORTS.filter((e) => !('price' in e) || showMoney).map((e) => (
            <Button key={e.kind} size="sm" variant="secondary" onClick={() => download(e.kind)}>
              <Download /> {e.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Quotation win rate" value={data.quotation.winRatePct == null ? '—' : `${data.quotation.winRatePct}%`} hint={`${data.quotation.accepted} won · ${data.quotation.lost} lost`} />
            <Stat label="Quotation revisions" value={data.quotation.revisions} hint="requested by customers" />
            <Stat label="Service resolution" value={hours(data.service.avgResolutionHours)} hint={`${data.service.resolved} resolved · ${data.service.opened} opened`} />
            <Stat
              label="Customer rating"
              value={data.service.avgCsat == null ? '—' : `${data.service.avgCsat} / 5`}
              hint={data.service.underWarrantyPct == null ? 'no tickets' : `${data.service.underWarrantyPct}% under warranty`}
            />
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="New and won projects per month" />
              <div className="h-64 p-2 md:p-4">
                <ResponsiveContainer>
                  <BarChart data={monthly} barGap={2} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="#ECEAE6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#F7F0E3' }} contentStyle={{ borderRadius: 0, border: '1px solid #ECEAE6', fontSize: 12 }} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#1F2328' }} />
                    <Bar dataKey="created" name="New projects" fill={SERIES_B} radius={0} maxBarSize={28} />
                    <Bar dataKey="won" name="Won (quotation accepted)" fill={SERIES_A} radius={0} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {showMoney && (
              <Card>
                <CardHeader title="Value won and money collected (₹)" />
                <div className="h-64 p-2 md:p-4">
                  <ResponsiveContainer>
                    <BarChart data={monthly} barGap={2} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="#ECEAE6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v: number) => formatINR(v, true)} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip
                        cursor={{ fill: '#F7F0E3' }}
                        formatter={(v) => formatINR(Number(v))}
                        contentStyle={{ borderRadius: 0, border: '1px solid #ECEAE6', fontSize: 12 }}
                      />
                      <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#1F2328' }} />
                      <Bar dataKey="wonValue" name="Value won" fill={SERIES_A} radius={0} maxBarSize={28} />
                      <Bar dataKey="collected" name="Collected" fill={SERIES_B} radius={0} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Time taken per stage" />
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="border-b bg-surface text-left text-[12px] text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 text-right font-medium">Completed</th>
                    <th className="px-4 py-2 text-right font-medium">Average</th>
                    <th className="px-4 py-2 text-right font-medium">Typical (median)</th>
                    <th className="px-4 py-2 text-right font-medium">Finished late</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.stageDurations.map((s) => (
                    <tr key={s.stage}>
                      <td className="px-4 py-2">
                        {STAGE_BY_CODE[s.stage].label}
                        <span className="ml-1.5 text-[11px] text-muted">{TEAM_LABELS[STAGE_BY_CODE[s.stage].team]}</span>
                      </td>
                      <td className="tabular px-4 py-2 text-right">{s.completed || '—'}</td>
                      <td className="tabular px-4 py-2 text-right">{hours(s.avgHours)}</td>
                      <td className="tabular px-4 py-2 text-right">{hours(s.medianHours)}</td>
                      <td className={cn('tabular px-4 py-2 text-right', (s.overSlaPct ?? 0) >= 50 && 'font-medium text-bad')}>
                        {s.overSlaPct == null ? '—' : `${s.overSlaPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader title={`Why projects were lost (${data.lostReasons.length})`} />
              {!data.lostReasons.length ? (
                <EmptyState title="No lost projects in this period" />
              ) : (
                <ul className="divide-y">
                  {data.lostReasons.map((l) => (
                    <li key={`${l.projectId}-${l.date}`}>
                      <Link href={`/projects/${l.projectId}`} className="block px-4 py-2.5 hover:bg-surface">
                        <p className="text-[13px]">{l.reason || <span className="text-muted">No reason given</span>}</p>
                        <p className="text-[11px] text-muted">
                          {l.customerName} · {l.projectCode} · {formatDate(l.date)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="overflow-hidden">
              <CardHeader title="Projects by status (all time)" />
              <ul className="divide-y">
                {data.projectsByStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span>{s.status.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                    <span className="tabular font-medium">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-3.5 md:p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}
