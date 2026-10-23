'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin, Phone, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { CustomerForm, type Customer } from '@/components/customer-form';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type CustomerRow = Customer & { projectCount: number };

export default function CustomersPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim());
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', query],
    queryFn: () => api<CustomerRow[]>(`/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.length}${data.length === 100 ? '+' : ''} customer${data.length === 1 ? '' : 's'}` : undefined}
        action={
          can('customer.manage') && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> <span className="hidden sm:inline">Add customer</span>
            </Button>
          )
        }
      />

      <div className="relative mb-4 md:w-80">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input placeholder="Search name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState title={query ? 'No matching customers' : 'No customers yet'} hint="Customers are also added when you create a project." />
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {data.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-600">
                {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.name}</p>
                <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>
                  {c.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{c.city}</span>}
                </p>
              </div>
              <span className="tabular text-[12px] text-muted">
                {c.projectCount} project{c.projectCount === 1 ? '' : 's'}
              </span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ))}
        </Card>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add customer">
        <CustomerForm onSaved={(c) => router.push(`/customers/${c.id}`)} />
      </Sheet>
    </>
  );
}
