'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ProjectListItem } from '@udhay/shared';
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { CustomerForm, type Customer } from '@/components/customer-form';
import { DueBadge, StageBadge, StageName, StatusBadge } from '@/components/status';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatINR } from '@/lib/utils';

type CustomerDetail = Customer & {
  canEdit: boolean;
  createdBy: { id: string; name: string };
  projects: ProjectListItem[];
};

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: c, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/customers/${id}`),
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (error || !c) {
    return (
      <Card>
        <EmptyState title="Customer not found" />
      </Card>
    );
  }

  const active = c.projects.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD').length;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <PageHeader
        title={c.name}
        subtitle={`Customer since ${formatDate(c.createdAt)} · added by ${c.createdBy.name}`}
        action={
          c.canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil /> <span className="hidden sm:inline">Edit</span>
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-3 p-4 text-[13px] md:col-span-1">
          {c.contactPerson && <p className="font-medium">{c.contactPerson}</p>}
          <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-ink hover:text-brand-600">
            <Phone className="size-4 text-muted" /> {c.phone}
          </a>
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all text-ink hover:text-brand-600">
              <Mail className="size-4 shrink-0 text-muted" /> {c.email}
            </a>
          )}
          {(c.address || c.city) && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>{[c.address, c.city].filter(Boolean).join(', ')}</span>
            </p>
          )}
          {c.gstin && <p className="text-muted">GSTIN <span className="font-mono text-ink">{c.gstin}</span></p>}
        </Card>

        <Card className="overflow-hidden md:col-span-2">
          <CardHeader
            title={`Projects (${c.projects.length}${active ? `, ${active} open` : ''})`}
            action={
              can('project.create') && (
                <Link href={`/projects/new?customerId=${c.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                  <Plus /> New project
                </Link>
              )
            }
          />
          {!c.projects.length ? (
            <EmptyState title="No projects you can see" />
          ) : (
            <ul className="divide-y">
              {c.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] font-medium text-muted">{p.code}</span>
                        <StageBadge stage={p.currentStage} />
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] font-medium">{p.title}</p>
                      <p className="text-[11px] text-muted"><StageName stage={p.currentStage} /></p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {p.status === 'ACTIVE' && <DueBadge startedAt={p.stageStartedAt} dueAt={p.stageDueAt} />}
                      {p.estimatedValue !== null && <span className="tabular text-[12px] text-muted">{formatINR(p.estimatedValue, true)}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit customer">
        <CustomerForm
          customer={c}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ['customer', id] });
            qc.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      </Sheet>
    </div>
  );
}
