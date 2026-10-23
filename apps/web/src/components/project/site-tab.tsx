'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { SiteSummary, SnagRow, StageCode } from '@udhay/shared';
import { CheckCircle2, FileText, Plus, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { uploadDocument } from '@/lib/upload';
import { formatDate, timeAgo } from '@/lib/utils';
import { ReasonOnly } from './payments-tab';
import { Notice, useProjectRefresh } from './shared';

export function SiteTab({
  projectId,
  stage,
  active,
  customer,
}: {
  projectId: string;
  stage: StageCode;
  active: boolean;
  customer: { contactPerson: string | null; phone: string };
}) {
  const refresh = useProjectRefresh(projectId);
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'site'],
    queryFn: () => api<SiteSummary>(`/projects/${projectId}/site`),
  });
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<SnagRow | null>(null);

  const act = useMutation({
    mutationFn: ({ path, method = 'POST', json }: { path: string; method?: string; json?: unknown }) =>
      api(path, { method, json: json ?? {} }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="m-4 h-40" />;
  const manage = data.canManage && active;

  return (
    <div>
      <section className="border-b">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h3 className="text-sm font-semibold">
            Snag list {data.openSnags > 0 && <Badge tone="amber" className="ml-1">{data.openSnags} open</Badge>}
          </h3>
          {manage && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus /> Add snag
            </Button>
          )}
        </div>
        {!data.snags.length ? (
          <EmptyState title="No snags" hint="Log anything that must be fixed on site before handover." />
        ) : (
          <ul className="divide-y border-t">
            {data.snags.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-[13px] font-medium ${s.status === 'RESOLVED' ? 'text-muted line-through' : ''}`}>{s.title}</p>
                    {s.description && <p className="text-[12px] text-muted">{s.description}</p>}
                    <p className="text-[11px] text-muted">
                      Raised by {s.raisedBy.name} · {timeAgo(s.createdAt)}
                    </p>
                    {s.status === 'RESOLVED' && (
                      <p className="mt-1 text-[12px] text-ok">
                        Fixed by {s.resolvedBy?.name}: {s.resolution}
                      </p>
                    )}
                  </div>
                  {s.status === 'OPEN' ? <Badge tone="amber">open</Badge> : <Badge tone="green">fixed</Badge>}
                </div>
                {manage && (
                  <div className="mt-2 flex gap-1.5">
                    {s.status === 'OPEN' ? (
                      <Button size="sm" onClick={() => setResolving(s)}>
                        <CheckCircle2 /> Mark fixed
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/snags/${s.id}/reopen` })}>
                        <RotateCcw /> Reopen
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-muted"
                      aria-label="Delete snag"
                      onClick={() => confirm('Delete this snag?') && act.mutate({ path: `/snags/${s.id}`, method: 'DELETE' })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-brand" /> Handover
        </h3>
        {data.handover ? (
          <div className="space-y-1 text-[13px]">
            <p>
              Signed by <span className="font-medium">{data.handover.signedByName}</span> on {formatDate(data.handover.signedAt, true)}
            </p>
            <p className="text-muted">
              Warranty {data.handover.warrantyMonths} months · until {formatDate(data.handover.warrantyEnd)}
              {data.handover.trainingDone && ' · staff training done'}
            </p>
            {data.handover.notes && <p className="text-muted">{data.handover.notes}</p>}
            <Link href={`/print/handover/${projectId}`} className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-2' })}>
              <FileText /> View / print certificate
            </Link>
          </div>
        ) : stage === 'HANDOVER' && manage ? (
          <HandoverForm
            projectId={projectId}
            defaultMonths={data.defaultWarrantyMonths}
            defaultName={customer.contactPerson ?? ''}
            defaultPhone={customer.phone}
            openSnags={data.openSnags}
            onDone={refresh}
          />
        ) : (
          <p className="text-[13px] text-muted">Recorded at the Handover stage with the customer's signature.</p>
        )}
      </section>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add snag">
        <SnagForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={!!resolving} onClose={() => setResolving(null)} title={`Mark fixed · ${resolving?.title ?? ''}`}>
        {resolving && (
          <ReasonOnly
            label="What was done?"
            confirm="Mark fixed"
            busy={act.isPending}
            onSubmit={(resolution) =>
              act.mutate({ path: `/snags/${resolving.id}/resolve`, json: { resolution } }, { onSuccess: () => setResolving(null) })
            }
          />
        )}
      </Sheet>
    </div>
  );
}

function SnagForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/snags`, { method: 'POST', json: { title: title.trim(), description: description.trim() || undefined } }),
    onSuccess: () => {
      toast.success('Snag added');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim().length >= 3) save.mutate();
      }}
    >
      <Field label="What needs fixing?">
        <Input autoFocus placeholder="e.g. Hood duct joint leaking" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>
      <Field label="Details (optional)">
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={title.trim().length < 3}>
        Add snag
      </Button>
    </form>
  );
}

function HandoverForm({
  projectId,
  defaultMonths,
  defaultName,
  defaultPhone,
  openSnags,
  onDone,
}: {
  projectId: string;
  defaultMonths: number;
  defaultName: string;
  defaultPhone: string;
  openSnags: number;
  onDone: () => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [months, setMonths] = useState(String(defaultMonths));
  const [training, setTraining] = useState(true);
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [signed, setSigned] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const proof = scan ?? (await pad.current?.toFile('handover-signature.png'));
      if (!proof) throw new Error('Get the customer signature or upload the signed certificate');
      const doc = await uploadDocument(projectId, 'HANDOVER_CERT', proof);
      await api(`/projects/${projectId}/handover`, {
        method: 'POST',
        json: {
          signedByName: name.trim(),
          signedByPhone: phone.trim() || undefined,
          warrantyMonths: Number(months),
          trainingDone: training,
          notes: notes.trim() || undefined,
          certificateDocumentId: doc.id,
        },
      });
    },
    onSuccess: () => {
      toast.success('Handover recorded. You can now hand the project to Service.');
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
      {openSnags > 0 && <Notice>{openSnags} snag(s) are still open. Close them before handing over if possible.</Notice>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer representative">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </Field>
        <Field label="Warranty (months)">
          <Input type="number" min={0} max={120} value={months} onChange={(e) => setMonths(e.target.value)} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} className="size-4 accent-[#B8862B]" />
          Kitchen staff trained
        </label>
      </div>
      <Field label="Notes (optional)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {!scan && (
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium">Customer signature</span>
          <SignaturePad ref={pad} onChange={(empty) => setSigned(!empty)} />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => setScan(e.target.files?.[0] ?? null)}
      />
      {scan ? (
        <p className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[13px]">
          <span className="truncate">{scan.name}</span>
          <button type="button" className="text-muted underline" onClick={() => setScan(null)}>
            Sign on screen instead
          </button>
        </p>
      ) : (
        <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload /> Or upload a signed paper certificate
        </Button>
      )}
      <Button
        type="submit"
        className="w-full"
        loading={save.isPending}
        disabled={name.trim().length < 2 || months === '' || (!scan && !signed)}
      >
        Record handover
      </Button>
    </form>
  );
}
