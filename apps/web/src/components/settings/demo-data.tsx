'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';

interface DemoStatus {
  loaded: boolean;
  projects: number;
  customers: number;
}

/** Loads clearly marked sample projects for training, and removes them in one go. */
export function DemoData() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['demo-data'], queryFn: () => api<DemoStatus>('/settings/demo-data') });
  const after = () => {
    qc.invalidateQueries({ queryKey: ['demo-data'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const load = useMutation({
    mutationFn: () => api<DemoStatus>('/settings/demo-data', { method: 'POST' }),
    onSuccess: (s) => {
      toast.success(`${s.projects} demo projects loaded`);
      after();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api<{ removedProjects: number }>('/settings/demo-data', { method: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(`${r.removedProjects} demo projects removed`);
      after();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-40" />;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4 text-brand" /> Demo data
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Sample customers and projects at every stage, from new lead to after-sales service, with payments, job cards, trips, snags, a
          handover and a service ticket. They are assigned to real people in each team so queues and dashboards look lived-in. Codes
          start with <span className="font-medium text-ink">DEMO-</span>, they carry a DEMO badge, and they don't use up real project
          numbers.
        </p>
      </div>
      <p className="text-[13px]">
        {data.loaded ? (
          <>
            <span className="font-medium">{data.projects}</span> demo projects and <span className="font-medium">{data.customers}</span> demo
            customers are loaded.
          </>
        ) : (
          'No demo data loaded.'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {!data.loaded ? (
          <Button loading={load.isPending} onClick={() => load.mutate()}>
            <Database /> Load demo data
          </Button>
        ) : (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => confirm('Remove all demo projects and customers? Real projects are not touched.') && remove.mutate()}
          >
            <Trash2 /> Remove demo data
          </Button>
        )}
      </div>
    </Card>
  );
}
