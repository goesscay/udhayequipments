'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProductionSummary, ProjectDetail, SiteSummary } from '@udhay/shared';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { documentObjectUrl } from '@/lib/upload';
import { formatDate } from '@/lib/utils';

/** A4 handover certificate: open it, then Print → Save as PDF to share with the customer. */
export default function HandoverCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const enabled = !!user;
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api<ProjectDetail>(`/projects/${id}`), enabled });
  const site = useQuery({ queryKey: ['project', id, 'site'], queryFn: () => api<SiteSummary>(`/projects/${id}/site`), enabled });
  const production = useQuery({
    queryKey: ['project', id, 'production'],
    queryFn: () => api<ProductionSummary>(`/projects/${id}/production`),
    enabled,
  });

  const handover = site.data?.handover;
  useEffect(() => {
    let url: string | null = null;
    if (handover?.certificateDocumentId) {
      documentObjectUrl(handover.certificateDocumentId)
        .then((u) => {
          url = u;
          setSignature(u);
        })
        .catch(() => setSignature(null));
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [handover?.certificateDocumentId]);

  if (!user || project.isLoading || site.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }
  const p = project.data;
  if (!p || !handover) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-[14px]">
        <p>No handover has been recorded for this project yet.</p>
        <Link href={`/projects/${id}`} className="mt-4 inline-block text-brand-600 underline">
          Back to project
        </Link>
      </div>
    );
  }
  const items = production.data?.items ?? [];

  return (
    <div className="min-h-dvh bg-surface py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link href={`/projects/${id}`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Back to project
        </Link>
        <Button onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-relaxed text-ink shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b pb-5">
          <Image src="/logo.png" alt="UDHAY Hospitality Equipment & Service" width={220} height={60} className="h-12 w-auto" priority />
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Certificate no.</p>
            <p className="font-semibold">{p.code}</p>
          </div>
        </header>

        <h1 className="mt-8 text-center text-xl font-semibold tracking-tight">Installation &amp; Handover Certificate</h1>
        <div className="mx-auto mt-2 h-px w-16 bg-brand" />

        <section className="mt-8 grid grid-cols-2 gap-x-10 gap-y-3">
          <Info label="Customer" value={p.customer.name} />
          <Info label="Project" value={p.title} />
          <Info label="Site" value={[p.siteAddress, p.city].filter(Boolean).join(', ') || '—'} />
          <Info label="Handover date" value={formatDate(handover.signedAt)} />
          <Info label="Warranty" value={`${handover.warrantyMonths} months, until ${formatDate(handover.warrantyEnd)}`} />
          <Info label="Staff training" value={handover.trainingDone ? 'Completed' : 'Not done'} />
        </section>

        {items.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Equipment handed over</h2>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-y bg-surface text-left">
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, n) => (
                  <tr key={i.id} className="border-b">
                    <td className="px-2 py-1.5 text-muted">{n + 1}</td>
                    <td className="px-2 py-1.5">
                      {i.name}
                      {i.spec && <span className="block text-[11px] text-muted">{i.spec}</span>}
                    </td>
                    <td className="tabular px-2 py-1.5 text-right">{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="mt-8">
          We confirm that the above equipment has been delivered, installed and demonstrated at the site in working
          condition, and that the installation has been handed over to the customer.
        </p>
        {handover.notes && <p className="mt-3 text-muted">Remarks: {handover.notes}</p>}

        <section className="mt-12 grid grid-cols-2 gap-10">
          <div>
            <div className="flex h-24 items-end border-b">
              {signature && <img src={signature} alt="Customer signature" className="max-h-24 object-contain" />}
            </div>
            <p className="mt-2 font-medium">{handover.signedByName}</p>
            <p className="text-[11px] text-muted">For the customer{handover.signedByPhone ? ` · ${handover.signedByPhone}` : ''}</p>
          </div>
          <div>
            <div className="h-24 border-b" />
            <p className="mt-2 font-medium">{handover.recordedBy.name}</p>
            <p className="text-[11px] text-muted">For UDHAY Hospitality Equipment &amp; Service</p>
          </div>
        </section>

        <footer className="mt-12 border-t pt-3 text-center text-[10px] uppercase tracking-[0.2em] text-muted">
          UDHAY Hospitality Equipment &amp; Service · Est. 1991
        </footer>
      </article>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
