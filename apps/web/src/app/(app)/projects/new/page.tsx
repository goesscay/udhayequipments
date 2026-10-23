'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PRIORITIES, createProjectSchema, type CreateProjectInput, type ProjectDetail } from '@udhay/shared';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';

export default function NewProjectPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { priority: 'NORMAL' },
  });

  const create = useMutation({
    mutationFn: (values: CreateProjectInput) =>
      api<ProjectDetail>('/projects', {
        method: 'POST',
        json: {
          ...values,
          customerEmail: values.customerEmail || undefined,
          customerPhone: values.customerPhone || undefined,
        },
      }),
    onSuccess: (p) => {
      toast.success(`Project ${p.code} created`);
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${p.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New project" subtitle="Capture the customer requirement. It starts at the Lead stage." />
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">Customer</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Customer / business name" error={errors.customerName?.message}>
              <Input placeholder="e.g. Hotel Saravana Bhavan" {...register('customerName')} />
            </Field>
            <Field label="Contact person" error={errors.contactPerson?.message}>
              <Input {...register('contactPerson')} />
            </Field>
            <Field label="Phone" error={errors.customerPhone?.message}>
              <Input type="tel" inputMode="tel" {...register('customerPhone')} />
            </Field>
            <Field label="Email (optional)" error={errors.customerEmail?.message}>
              <Input type="email" {...register('customerEmail')} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">Project</h2>
          <Field label="Project title" error={errors.title?.message}>
            <Input placeholder="e.g. Main kitchen, 120 covers" {...register('title')} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="City" error={errors.city?.message}>
              <Input {...register('city')} />
            </Field>
            <Field label="Priority">
              <Select {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{humanize(p)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Site address" error={errors.siteAddress?.message}>
            <Textarea rows={2} {...register('siteAddress')} />
          </Field>
          <Field label="Requirement" hint="Cuisine, covers, equipment list, utilities, budget, timeline…" error={errors.requirement?.message}>
            <Textarea rows={5} {...register('requirement')} />
          </Field>
          {can('price.view') && (
            <Field label="Estimated value (₹)" error={errors.estimatedValue?.message}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                {...register('estimatedValue', { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })}
              />
            </Field>
          )}
        </Card>

        <div className="sticky bottom-20 flex gap-2 md:static">
          <Button type="button" variant="secondary" onClick={() => router.back()} className="flex-1 md:flex-none">
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} className="flex-1 md:flex-none">
            Create project
          </Button>
        </div>
      </form>
    </div>
  );
}
