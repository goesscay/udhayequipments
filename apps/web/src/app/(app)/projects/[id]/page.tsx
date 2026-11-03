'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  TEAM_LABELS,
  type AvailableAction,
  type DocumentType,
  type ProjectDetail,
  type ResolvedWorkflow,
} from '@udhay/shared';
import { AlertCircle, ArrowLeft, Download, FileText, MapPin, Pencil, Phone, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MentionText, MentionTextarea, toStored } from '@/components/mentions';
import { DispatchTab } from '@/components/project/dispatch-tab';
import { PaymentsTab } from '@/components/project/payments-tab';
import { ProductionTab } from '@/components/project/production-tab';
import { ServiceTab } from '@/components/project/service-tab';
import { SiteTab } from '@/components/project/site-tab';
import { ProjectEditForm } from '@/components/project-edit-form';
import { DemoBadge, DueBadge, PriorityBadge, StageBadge, StageName, StatusBadge } from '@/components/status';
import { StageStepper } from '@/components/stage-stepper';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkflow } from '@/lib/workflow';
import { uploadDocument } from '@/lib/upload';
import { cn, formatDate, formatINR, humanize, timeAgo } from '@/lib/utils';

type Tab = 'timeline' | 'documents' | 'comments' | 'payments' | 'production' | 'dispatch' | 'site' | 'service';

const TAB_LABELS: Record<Tab, string> = {
  timeline: 'Timeline',
  documents: 'Documents',
  comments: 'Comments',
  payments: 'Payments',
  production: 'Production',
  dispatch: 'Dispatch',
  site: 'Site & handover',
  service: 'Service',
};

/** Operational tabs appear once the project reaches the stage they belong to. */
/** Tabs appear once the project has reached the stage they belong to, in the configured order. */
function tabsFor(p: ProjectDetail, canSeePrices: boolean, wf: ResolvedWorkflow): Tab[] {
  const at = wf.index(p.currentStage);
  const closed = p.status === 'COMPLETED';
  const tabs: Tab[] = ['timeline', 'documents', 'comments'];
  if (canSeePrices) tabs.push('payments');
  if (at >= wf.index('CAD_DRAWING') || closed) tabs.push('production');
  if (at >= wf.index('PRODUCTION') || closed) tabs.push('dispatch');
  if (at >= wf.index('DISPATCH') || closed) tabs.push('site');
  if (at >= wf.index('SERVICE') || closed) tabs.push('service');
  return tabs;
}

/** The tab where the current stage's work happens. */
function defaultTab(p: ProjectDetail): Tab {
  switch (p.currentStage) {
    case 'PRODUCTION':
      return 'production';
    case 'DISPATCH':
      return 'dispatch';
    case 'INSTALLATION':
    case 'HANDOVER':
      return 'site';
    case 'SERVICE':
      return 'service';
    default:
      return 'timeline';
  }
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAuth();
  const wf = useWorkflow();
  const [editing, setEditing] = useState(false);
  const [tabChoice, setTab] = useState<Tab | null>(null);
  const [pending, setPending] = useState<AvailableAction | null>(null);
  const [manage, setManage] = useState<'hold' | 'cancel' | null>(null);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<ProjectDetail>(`/projects/${id}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project', id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const post = useMutation({
    mutationFn: ({ path, json }: { path: string; json?: unknown }) =>
      api(`/projects/${id}/${path}`, { method: 'POST', json: json ?? {} }),
    onSuccess: () => {
      refresh();
      setPending(null);
      setManage(null);
    },
    // The API lists every unmet rule and missing document in one message.
    onError: (e: Error) => toast.error(e.message),
  });

  const runAction = (a: AvailableAction, reason?: string) =>
    post.mutate(
      { path: 'transitions', json: { action: a.action, reason } },
      { onSuccess: () => toast.success(a.label) },
    );

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !p) {
    return (
      <Card>
        <EmptyState title="Project not found" hint="It may not exist or you may not have access." />
      </Card>
    );
  }

  const open = [...p.stages].reverse().find((s) => s.status === 'OPEN');
  const tabs = tabsFor(p, can('price.view'), wf);
  const tab: Tab = tabChoice && tabs.includes(tabChoice) ? tabChoice : tabs.includes(defaultTab(p)) ? defaultTab(p) : 'timeline';
  const active = p.status === 'ACTIVE';

  return (
    <div className="pb-24 md:pb-0">
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      {/* Header */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-muted">{p.code}</span>
          <DemoBadge isDemo={p.isDemo} />
          <StatusBadge status={p.status} />
          <PriorityBadge priority={p.priority} />
          {can('project.update') && (
            <Button variant="ghost" size="sm" className="ml-auto -mr-2 text-muted" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
          {can('customer.view') ? (
            <Link href={`/customers/${p.customer.id}`} className="hover:text-brand-600">
              {p.customer.name}
            </Link>
          ) : (
            p.customer.name
          )}
        </h1>
        <p className="text-[13px] text-muted">{p.title}</p>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted">
          <a href={`tel:${p.customerContact.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
            <Phone className="size-3.5" />
            {p.customerContact.contactPerson ? `${p.customerContact.contactPerson} · ` : ''}
            {p.customerContact.phone}
          </a>
          {(p.city || p.siteAddress) && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {[p.siteAddress, p.city].filter(Boolean).join(', ')}
            </span>
          )}
          <span>Sales: {p.salesOwner.name}</span>
          {p.estimatedValue !== null && <span className="tabular font-medium text-ink">{formatINR(p.estimatedValue)}</span>}
        </div>

        {p.status === 'ON_HOLD' && p.holdReason && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-[13px] text-warn">On hold: {p.holdReason}</p>
        )}

        {/* Current stage box */}
        {p.status === 'ACTIVE' && (
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand-50/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-brand-600">Current stage</p>
                <p className="font-semibold"><StageName stage={p.currentStage} /></p>
                <p className="text-[12px] text-muted">
                  {TEAM_LABELS[p.currentTeam]} · {p.assignee?.name ?? 'Unassigned'}
                  {!p.accepted && ' · waiting for acceptance'}
                </p>
              </div>
              <DueBadge startedAt={p.stageStartedAt} dueAt={p.stageDueAt} />
            </div>
            {p.canAssign && <AssignControl project={p} onDone={refresh} />}
          </div>
        )}

        {/* Desktop actions */}
        <div className="mt-4 hidden flex-wrap gap-2 md:flex">
          <Actions p={p} busy={post.isPending} onAccept={() => post.mutate({ path: 'accept' })} onAction={setPending} />
          <ManageButtons p={p} onHold={() => setManage('hold')} onCancel={() => setManage('cancel')} onResume={() => post.mutate({ path: 'resume' })} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-4 text-sm font-semibold">Workflow</h2>
          <StageStepper project={p} />
        </Card>

        <div className="space-y-4 lg:order-1 lg:col-span-2">
          {p.requirement && (
            <Card>
              <CardHeader title="Requirement" />
              <p className="whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">{p.requirement}</p>
            </Card>
          )}

          <Card>
            <div className="flex overflow-x-auto no-scrollbar border-b">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-medium md:px-4',
                    tab === t ? 'border-brand text-ink' : 'border-transparent text-muted',
                  )}
                >
                  {TAB_LABELS[t]}
                  {t === 'documents' && p.documents.length > 0 && <span className="ml-1 text-muted">({p.documents.length})</span>}
                </button>
              ))}
            </div>
            {tab === 'timeline' && <Timeline p={p} />}
            {tab === 'documents' && <Documents p={p} onChange={refresh} openStageCycle={open?.cycle ?? 1} />}
            {tab === 'comments' && <Comments p={p} onChange={refresh} />}
            {tab === 'payments' && <PaymentsTab projectId={p.id} projectValue={p.estimatedValue} />}
            {tab === 'production' && <ProductionTab projectId={p.id} active={active} />}
            {tab === 'dispatch' && <DispatchTab projectId={p.id} active={active} />}
            {tab === 'site' && (
              <SiteTab projectId={p.id} stage={p.currentStage} active={active} customer={p.customerContact} />
            )}
            {tab === 'service' && (
              <ServiceTab
                projectId={p.id}
                canRaise={p.currentStage === 'SERVICE' || p.status === 'COMPLETED'}
                contact={{ name: p.customerContact.contactPerson, phone: p.customerContact.phone }}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      {(p.availableActions.length > 0 || p.canAccept) && (
        <div className="pb-safe fixed inset-x-0 bottom-[57px] z-20 border-t bg-white/95 p-3 backdrop-blur md:hidden">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <Actions p={p} busy={post.isPending} onAccept={() => post.mutate({ path: 'accept' })} onAction={setPending} mobile />
          </div>
        </div>
      )}

      <ActionSheet
        action={pending}
        busy={post.isPending}
        onClose={() => setPending(null)}
        onConfirm={(reason) => pending && runAction(pending, reason)}
      />
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit project">
        <ProjectEditForm
          project={p}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage === 'hold' ? 'Put project on hold' : 'Cancel project'}>
        <ReasonForm
          busy={post.isPending}
          confirmLabel={manage === 'hold' ? 'Put on hold' : 'Cancel project'}
          danger={manage === 'cancel'}
          onSubmit={(reason) => post.mutate({ path: manage!, json: { reason } })}
        />
      </Sheet>
    </div>
  );
}

function Actions({
  p,
  busy,
  onAccept,
  onAction,
  mobile,
}: {
  p: ProjectDetail;
  busy: boolean;
  onAccept: () => void;
  onAction: (a: AvailableAction) => void;
  mobile?: boolean;
}) {
  return (
    <>
      {p.canAccept && (
        <Button onClick={onAccept} loading={busy} className={cn(mobile && 'flex-1')}>
          Accept handoff
        </Button>
      )}
      {p.availableActions.map((a) => (
        <Button
          key={a.action}
          variant={a.tone === 'primary' && !p.canAccept ? 'primary' : a.tone === 'danger' ? 'danger' : 'secondary'}
          onClick={() => onAction(a)}
          disabled={busy}
          className={cn(mobile && a.tone === 'primary' && 'flex-1')}
        >
          {a.label}
        </Button>
      ))}
    </>
  );
}

function ManageButtons({
  p,
  onHold,
  onCancel,
  onResume,
}: {
  p: ProjectDetail;
  onHold: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  if (!p.canManage) return null;
  return (
    <div className="ml-auto flex gap-2">
      {p.status === 'ACTIVE' && <Button variant="ghost" onClick={onHold}>Hold</Button>}
      {p.status === 'ON_HOLD' && <Button variant="secondary" onClick={onResume}>Resume</Button>}
      {(p.status === 'ACTIVE' || p.status === 'ON_HOLD') && <Button variant="ghost" className="text-bad" onClick={onCancel}>Cancel project</Button>}
    </div>
  );
}

function ActionSheet({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: AvailableAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  if (!action) return null;
  return (
    <Sheet open onClose={onClose} title={action.label}>
      {action.blockers.length > 0 || action.missingDocuments.length > 0 ? (
        <div className="space-y-3 text-[13px]">
          <p>Not yet. First:</p>
          <ul className="space-y-1.5">
            {action.blockers.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warn" /> {b}
              </li>
            ))}
            {action.missingDocuments.map((d) => (
              <li key={d} className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted" /> Upload: {DOCUMENT_LABELS[d]} (Documents tab)
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="w-full" onClick={onClose}>OK</Button>
        </div>
      ) : action.reasonRequired ? (
        <ReasonForm busy={busy} confirmLabel={action.label} danger={action.tone === 'danger'} onSubmit={onConfirm} />
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">This will move the project to the next stage and notify the receiving team.</p>
          <Button className="w-full" loading={busy} onClick={() => onConfirm()}>Confirm</Button>
        </div>
      )}
    </Sheet>
  );
}

function ReasonForm({
  busy,
  confirmLabel,
  danger,
  onSubmit,
}: {
  busy: boolean;
  confirmLabel: string;
  danger?: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim()) onSubmit(reason.trim());
      }}
    >
      <Field label="Reason">
        <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} className="w-full" loading={busy} disabled={!reason.trim()}>
        {confirmLabel}
      </Button>
    </form>
  );
}

function AssignControl({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const { can } = useAuth();
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ id: string; name: string; isActive: boolean; team: { code: string } | null }[]>('/users'),
    enabled: can('user.view'),
  });
  const assign = useMutation({
    mutationFn: (userId: string) => api(`/projects/${project.id}/assign`, { method: 'POST', json: { userId } }),
    onSuccess: () => {
      toast.success('Assigned');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const options = users?.filter(
    (u) => u.isActive && (project.currentTeam === 'MANAGEMENT' || u.team?.code === project.currentTeam),
  );
  if (!options?.length) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-[12px] text-muted">Assign to</span>
      <Select
        className="h-8 max-w-56 text-[13px]"
        value={project.assignee?.id ?? ''}
        disabled={assign.isPending}
        onChange={(e) => e.target.value && assign.mutate(e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </Select>
    </div>
  );
}

function Timeline({ p }: { p: ProjectDetail }) {
  if (!p.timeline.length) return <EmptyState title="No activity yet" />;
  return (
    <ul className="divide-y">
      {p.timeline.map((t) => (
        <li key={t.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px]">
              <span className="font-medium">{t.by.name}</span> <span className="text-muted">{humanize(t.action)}</span>
              {t.toStage && t.toStage !== t.fromStage && (
                <>
                  {' '}→ <StageBadge stage={t.toStage} />
                </>
              )}
            </p>
            <span className="shrink-0 text-[11px] text-muted" title={formatDate(t.createdAt, true)}>
              {timeAgo(t.createdAt)}
            </span>
          </div>
          {t.reason && <p className="mt-1 rounded-md bg-surface px-2.5 py-1.5 text-[12px] text-ink">{t.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

function Documents({ p, onChange, openStageCycle }: { p: ProjectDetail; onChange: () => void; openStageCycle: number }) {
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const needed = p.availableActions.flatMap((a) => a.missingDocuments);
  const [type, setType] = useState<DocumentType>(needed[0] ?? 'OTHER');

  const upload = useMutation({
    mutationFn: (file: File) => uploadDocument(p.id, type, file),
    onSuccess: () => {
      toast.success('Uploaded');
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  const download = async (docId: string, name: string) => {
    try {
      const blob = await api<Blob>(`/documents/${docId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      {can('document.upload') && (
        <div className="flex flex-col gap-2 border-b p-4 md:flex-row md:items-center">
          <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="md:w-60">
            {DOCUMENT_TYPES.filter((t) => can('price.view') || (t !== 'QUOTATION' && t !== 'BOQ')).map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_LABELS[t]}
                {needed.includes(t) ? ' (required)' : ''}
              </option>
            ))}
          </Select>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.dwg,.dxf,.xlsx,.xls,.docx,.doc,.zip"
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          <Button variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            <Upload /> Upload file
          </Button>
          {openStageCycle > 1 && needed.length > 0 && (
            <span className="text-[12px] text-warn">Revision: upload a new version</span>
          )}
        </div>
      )}
      {!p.documents.length ? (
        <EmptyState title="No documents yet" />
      ) : (
        <ul className="divide-y">
          {p.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{d.fileName}</p>
                <p className="text-[11px] text-muted">
                  {DOCUMENT_LABELS[d.type]} · v{d.version} · {d.uploadedBy.name} · {timeAgo(d.createdAt)}
                </p>
              </div>
              {d.version > 1 && <Badge tone="brand">v{d.version}</Badge>}
              <button onClick={() => download(d.id, d.fileName)} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Download">
                <Download className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comments({ p, onChange }: { p: ProjectDetail; onChange: () => void }) {
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () => api(`/projects/${p.id}/comments`, { method: 'POST', json: { body: toStored(body.trim(), picked) } }),
    onSuccess: () => {
      setBody('');
      setPicked({});
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div>
      <form
        className="flex gap-2 border-b p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <MentionTextarea
          value={body}
          onChange={setBody}
          picked={picked}
          onPick={(name, uid) => setPicked((m) => ({ ...m, [name]: uid }))}
          placeholder="Write a comment… type @ to mention"
        />
        <Button type="submit" loading={add.isPending} disabled={!body.trim()}>Post</Button>
      </form>
      {!p.comments.length ? (
        <EmptyState title="No comments yet" />
      ) : (
        <ul className="divide-y">
          {p.comments.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <p className="text-[12px]">
                <span className="font-medium">{c.author.name}</span>{' '}
                <span className="text-muted">· {timeAgo(c.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">
                <MentionText body={c.body} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
