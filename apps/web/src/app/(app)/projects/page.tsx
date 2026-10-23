'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  PROJECT_STATUSES,
  STAGES,
  STAGE_BY_CODE,
  TEAMS,
  TEAM_LABELS,
  stageIndex,
  type Paginated,
  type ProjectListItem,
} from '@udhay/shared';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { DueBadge, PriorityBadge, StageBadge, StatusBadge } from '@/components/status';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatINR, humanize } from '@/lib/utils';

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsList />
    </Suspense>
  );
}

function ProjectsList() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (params.get('search') ?? '')) setParam('search', search);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const page = Number(params.get('page') ?? 1);
  const query = params.toString();
  const { data, isLoading } = useQuery({
    queryKey: ['projects', query],
    queryFn: () => api<Paginated<ProjectListItem>>(`/projects?${query}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={data ? `${data.total} project${data.total === 1 ? '' : 's'}` : undefined}
        action={
          can('project.create') && (
            <Link href="/projects/new" className={buttonVariants({ size: 'md', className: 'hidden md:inline-flex' })}>
              <Plus /> New project
            </Link>
          )
        }
      />

      <div className="mb-4 space-y-2 md:flex md:gap-2 md:space-y-0">
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search code, customer, phone, city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto no-scrollbar px-4 md:mx-0 md:px-0">
          <Select value={params.get('stage') ?? ''} onChange={(e) => setParam('stage', e.target.value)} className="w-auto min-w-36">
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </Select>
          <Select value={params.get('team') ?? ''} onChange={(e) => setParam('team', e.target.value)} className="w-auto min-w-32">
            <option value="">All teams</option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>{TEAM_LABELS[t]}</option>
            ))}
          </Select>
          <Select value={params.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)} className="w-auto min-w-32">
            <option value="">Any status</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </Select>
          <Button
            variant={params.get('overdue') ? 'primary' : 'secondary'}
            onClick={() => setParam('overdue', params.get('overdue') ? '' : 'true')}
          >
            Overdue
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState title="No projects found" hint="Try clearing the filters." />
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-2 md:hidden">
            {data.items.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-muted">{p.code}</span>
                    <DueBadge startedAt={p.stageStartedAt} dueAt={p.status === 'ACTIVE' ? p.stageDueAt : null} />
                  </div>
                  <p className="mt-1 truncate font-medium">{p.customer.name}</p>
                  <p className="truncate text-[12px] text-muted">{p.title}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <StageBadge stage={p.currentStage} />
                    <StatusBadge status={p.status} />
                    <PriorityBadge priority={p.priority} />
                    <StageProgress stage={p.currentStage} className="ml-auto w-20" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-[13px]">
              <thead className="border-b bg-surface text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium">With</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {can('price.view') && <th className="px-4 py-2.5 text-right font-medium">Value</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((p) => (
                  <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="cursor-pointer hover:bg-surface">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.customer.name}</p>
                      <p className="text-[12px] text-muted">
                        {p.code} · {p.title}
                        {p.city ? ` · ${p.city}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{STAGE_BY_CODE[p.currentStage].label}</p>
                      <p className="text-[12px] text-muted">{TEAM_LABELS[p.currentTeam]}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StageProgress stage={p.currentStage} className="w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <p>{p.assignee?.name ?? <span className="text-muted">Unassigned</span>}</p>
                      {!p.accepted && p.status === 'ACTIVE' && <p className="text-[11px] text-warn">Not accepted yet</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={p.status} />
                        <PriorityBadge priority={p.priority} />
                        {p.status === 'ACTIVE' && <DueBadge startedAt={p.stageStartedAt} dueAt={p.stageDueAt} />}
                      </div>
                    </td>
                    {can('price.view') && (
                      <td className="tabular px-4 py-3 text-right">{formatINR(p.estimatedValue, true)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-[13px]">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParamPage(page - 1)}>
                Previous
              </Button>
              <span className="text-muted">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setParamPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );

  function setParamPage(n: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(n));
    router.replace(`${pathname}?${next}`);
  }
}

function StageProgress({ stage, className }: { stage: ProjectListItem['currentStage']; className?: string }) {
  const pct = ((stageIndex(stage) + 1) / STAGES.length) * 100;
  return (
    <div className={className} title={`Stage ${stageIndex(stage) + 1} of ${STAGES.length}`}>
      <div className="h-1.5 overflow-hidden rounded-none bg-surface ring-1 ring-line">
        <div className="h-full rounded-none bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <p className="tabular mt-1 text-[10px] text-muted">
        {stageIndex(stage) + 1}/{STAGES.length}
      </p>
    </div>
  );
}
