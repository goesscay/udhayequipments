'use client';

import { useQuery } from '@tanstack/react-query';
import { STAGE_BY_CODE, TEAM_LABELS, type DashboardSummary } from '@udhay/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  FolderKanban,
  Hourglass,
  IndianRupee,
  PauseCircle,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { StagePipelineChart } from '@/components/stage-pipeline-chart';
import { DueBadge, StageBadge } from '@/components/status';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatINR, humanize, timeAgo } from '@/lib/utils';

function Kpi({
  label,
  value,
  icon: Icon,
  tone = 'default',
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: 'default' | 'red' | 'brand';
  href?: string;
}) {
  const body = (
    <Card className="h-full p-3.5 transition-colors hover:border-brand/30 md:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] leading-tight text-muted">{label}</p>
        <Icon className={cn('size-4 text-muted', tone === 'red' && 'text-bad', tone === 'brand' && 'text-brand')} />
      </div>
      <p className={cn('tabular mt-2 text-2xl font-semibold tracking-tight', tone === 'red' && 'text-bad')}>{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 60_000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${greeting}, ${user?.name.split(' ')[0]}`} subtitle="Live status of all projects" />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Active projects" value={data.kpis.activeProjects} icon={FolderKanban} href="/projects?status=ACTIVE" />
            <Kpi label="Overdue stages" value={data.kpis.overdue} icon={AlertTriangle} tone={data.kpis.overdue ? 'red' : 'default'} href="/projects?overdue=true" />
            {data.kpis.pipelineValue !== null && (
              <Kpi label="Pipeline value" value={formatINR(data.kpis.pipelineValue, true)} icon={IndianRupee} tone="brand" />
            )}
            <Kpi label="Awaiting customer" value={data.kpis.awaitingCustomer} icon={Hourglass} />
            <Kpi label="In production" value={data.kpis.inProduction} icon={Factory} href="/projects?stage=PRODUCTION" />
            <Kpi label="In dispatch" value={data.kpis.inDispatch} icon={Truck} href="/projects?stage=DISPATCH" />
            <Kpi label="Won / lost this month" value={`${data.kpis.wonThisMonth} / ${data.kpis.lostThisMonth}`} icon={CheckCircle2} />
            <Kpi label="On hold" value={data.kpis.onHold} icon={PauseCircle} href="/projects?status=ON_HOLD" />
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader
                title="Projects by stage"
                action={
                  <span className="flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-brand" />On track</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-bad" />Overdue</span>
                  </span>
                }
              />
              <div className="p-2 md:p-4">
                <StagePipelineChart data={data.stageCounts} />
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Team workload" />
              <ul className="divide-y">
                {data.teamWorkload
                  .filter((t) => t.team !== 'MANAGEMENT' || t.active > 0)
                  .map((t) => {
                    const max = Math.max(1, ...data.teamWorkload.map((x) => x.active));
                    return (
                      <li key={t.team}>
                        <Link href={`/projects?team=${t.team}&status=ACTIVE`} className="block px-4 py-3 hover:bg-surface">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-medium">{TEAM_LABELS[t.team]}</span>
                            <span className="tabular text-muted">
                              {t.active}
                              {t.overdue > 0 && <span className="ml-2 text-bad">{t.overdue} late</span>}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                            <div className="flex h-full">
                              <div className="bg-brand" style={{ width: `${((t.active - t.overdue) / max) * 100}%` }} />
                              <div className="bg-bad" style={{ width: `${(t.overdue / max) * 100}%` }} />
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader
                title="Overdue: needs attention"
                action={<Link href="/projects?overdue=true" className="text-[12px] font-medium text-brand-600">View all</Link>}
              />
              {data.overdueProjects.length === 0 ? (
                <EmptyState title="Nothing overdue" hint="All stages are within their target time." />
              ) : (
                <ul className="divide-y">
                  {data.overdueProjects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-muted">{p.code}</span>
                            <StageBadge stage={p.currentStage} />
                          </div>
                          <p className="mt-0.5 truncate text-[14px] font-medium">{p.customer.name}</p>
                          <p className="truncate text-[12px] text-muted">
                            {TEAM_LABELS[p.currentTeam]} · {p.assignee?.name ?? 'Unassigned'}
                          </p>
                        </div>
                        <DueBadge startedAt={p.stageStartedAt} dueAt={p.stageDueAt} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Recent activity" />
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet" />
              ) : (
                <ul className="divide-y">
                  {data.recentActivity.map((a) => (
                    <li key={a.id}>
                      <Link href={`/projects/${a.projectId}`} className="block px-4 py-2.5 hover:bg-surface">
                        <p className="text-[13px]">
                          <span className="font-medium">{a.by}</span>{' '}
                          <span className="text-muted">{humanize(a.action)}</span>
                          {a.toStage && a.toStage !== a.fromStage && (
                            <> → <span className="font-medium">{STAGE_BY_CODE[a.toStage].short}</span></>
                          )}
                        </p>
                        <p className="text-[11px] text-muted">
                          {a.projectCode} · {timeAgo(a.createdAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
