'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRIORITIES, createProjectSchema, type CreateProjectInput, type ProjectDetail } from '@udhay/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import type { Customer } from '@/components/customer-form';
import { CustomerSuggest } from '@/components/customer-suggest';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectForm />
    </Suspense>
  );
}

function NewProjectForm() {
  const router = useRouter();
  // Started from a customer page: reuse that customer instead of creating a new one.
  const customerId = useSearchParams().get('customerId') ?? undefined;
  const { data: existing } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api<Customer>(`/customers/${customerId}`),
    enabled: !!customerId,
  });
  const qc = useQueryClient();
  const { can } = useAuth();
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { priority: 'NORMAL', customerId },
    values: existing ? { priority: 'NORMAL', title: '', customerId, city: existing.city ?? '', siteAddress: existing.address ?? '' } : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  // An existing customer picked from the name suggestions; its saved details are used as-is.
  const [picked, setPicked] = useState<Customer | null>(null);
  const pickCustomer = (c: Customer) => {
    setPicked(c);
    const opts = { shouldValidate: true, shouldDirty: true };
    setValue('customerId', c.id, opts);
    setValue('customerName', c.name, opts);
    setValue('contactPerson', c.contactPerson ?? '', opts);
    setValue('customerPhone', c.phone ?? '', opts);
    setValue('customerEmail', c.email ?? '', opts);
    // Site details usually match the customer's; only fill what is still empty.
    if (!getValues('city')) setValue('city', c.city ?? '', opts);
    if (!getValues('siteAddress')) setValue('siteAddress', c.address ?? '', opts);
  };
  const unpick = () => {
    setPicked(null);
    setValue('customerId', undefined);
  };
  const nameField = register('customerName');

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
        {customerId ? (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Customer</h2>
            <p className="mt-2 text-[14px] font-medium">{existing?.name ?? 'Loading…'}</p>
            {existing && (
              <p className="text-[12px] text-muted">
                {[existing.contactPerson, existing.phone, existing.city].filter(Boolean).join(' · ')}
              </p>
            )}
          </Card>
        ) : (
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">Customer</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Customer / business name"
              hint={can('customer.view') ? 'Type to search existing customers' : undefined}
              error={errors.customerName?.message}
            >
              <CustomerSuggest
                placeholder="e.g. Hotel Saravana Bhavan"
                enabled={can('customer.view') && !picked}
                value={watch('customerName') ?? ''}
                onPick={pickCustomer}
                {...nameField}
                onChange={(e) => {
                  // Editing the name after picking means it's a different (new) customer.
                  if (picked) unpick();
                  nameField.onChange(e);
                }}
              />
            </Field>
            <Field label="Contact person" error={errors.contactPerson?.message}>
              <Input readOnly={!!picked} {...register('contactPerson')} />
            </Field>
            <Field label="Phone" error={errors.customerPhone?.message}>
              <Input type="tel" inputMode="tel" readOnly={!!picked} {...register('customerPhone')} />
            </Field>
            <Field label="Email (optional)" error={errors.customerEmail?.message}>
              <Input type="email" readOnly={!!picked} {...register('customerEmail')} />
            </Field>
          </div>
          {picked && (
            <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-surface px-3 py-2 text-[12px] text-muted">
              <span>Existing customer — the project is added to {picked.name}. Edit their details from the customer page.</span>
              <button type="button" className="font-medium text-brand underline" onClick={unpick}>
                New customer instead
              </button>
            </p>
          )}
        </Card>
        )}

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
