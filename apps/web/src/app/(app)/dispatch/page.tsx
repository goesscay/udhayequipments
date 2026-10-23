'use client';

import { useQuery } from '@tanstack/react-query';
import type { DispatchBoardTrip } from '@udhay/shared';
import { MapPin, Phone, Truck } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { TRIP_LABEL, TRIP_TONE } from '@/components/project/dispatch-tab';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

function dayLabel(key: string) {
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  const d = new Date(`${key}T00:00:00`);
  const name = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  if (key === today) return `Today · ${name}`;
  if (key === tomorrow) return `Tomorrow · ${name}`;
  return key < today ? `${name} (overdue)` : name;
}

/** Two-week dispatch calendar across all projects, plus anything still on the road. */
export default function DispatchBoardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-board'],
    queryFn: () => api<DispatchBoardTrip[]>('/dispatch/board'),
    refetchInterval: 60_000,
  });

  const groups = new Map<string, DispatchBoardTrip[]>();
  for (const t of data ?? []) {
    const k = dayKey(t.plannedDate);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  return (
    <>
      <PageHeader title="Dispatch" subtitle="Next 14 days, plus trips still planned or on the road" />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !groups.size ? (
        <Card>
          <EmptyState title="Nothing scheduled" hint="Trips are planned from each project's Dispatch tab." />
        </Card>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, trips]) => (
            <section key={day}>
              <h2 className={`mb-2 text-[12px] font-semibold uppercase tracking-wide ${day < new Date().toLocaleDateString('en-CA') ? 'text-bad' : 'text-muted'}`}>
                {dayLabel(day)} <span className="tabular">({trips.length})</span>
              </h2>
              <Card className="divide-y overflow-hidden">
                {trips.map((t) => (
                  <Link key={t.id} href={`/projects/${t.project.id}`} className="block px-4 py-3 hover:bg-surface">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium">
                        <Truck className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{t.project.customerName}</span>
                      </p>
                      <Badge tone={TRIP_TONE[t.status]}>{TRIP_LABEL[t.status]}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {t.project.code} · trip {t.tripNo}
                      {t.vehicleNo && ` · ${t.vehicleNo}`}
                      {t.driverName && ` · ${t.driverName}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-muted">
                      {(t.project.siteAddress || t.project.city) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {[t.project.siteAddress, t.project.city].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {t.driverPhone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {t.driverPhone}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
