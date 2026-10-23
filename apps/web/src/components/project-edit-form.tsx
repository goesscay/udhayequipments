'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { PRIORITIES, type ProjectDetail } from '@udhay/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a project title').max(160),
  city: z.string().trim().max(80),
  siteAddress: z.string().trim().max(500),
  requirement: z.string().trim().max(5000),
  priority: z.enum(PRIORITIES),
  estimatedValue: z.number().nonnegative().optional(),
});
type Values = z.infer<typeof schema>;

export function ProjectEditForm({ project, onSaved }: { project: ProjectDetail; onSaved: () => void }) {
  const { can } = useAuth();
  const showPrice = can('price.view');
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: project.title,
      city: project.city ?? '',
      siteAddress: project.siteAddress ?? '',
      requirement: project.requirement ?? '',
      priority: project.priority,
      estimatedValue: project.estimatedValue ?? undefined,
    },
  });

  const save = useMutation({
    // Send only changed fields, so a user without price access never touches the value.
    mutationFn: (v: Values) =>
      api(`/projects/${project.id}`, {
        method: 'PATCH',
        json: Object.fromEntries(Object.entries(v).filter(([k]) => dirtyFields[k as keyof Values])),
      }),
    onSuccess: () => {
      toast.success('Project updated');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="max-h-[70dvh] space-y-3 overflow-y-auto">
      <Field label="Project title" error={errors.title?.message}>
        <Input {...register('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
      <Field label="Requirement" error={errors.requirement?.message}>
        <Textarea rows={5} {...register('requirement')} />
      </Field>
      {showPrice && (
        <Field label="Estimated value (₹)" error={errors.estimatedValue?.message}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            {...register('estimatedValue', { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })}
          />
        </Field>
      )}
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!Object.keys(dirtyFields).length}>
        Save changes
      </Button>
    </form>
  );
}
