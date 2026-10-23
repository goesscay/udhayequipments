'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';

export interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  gstin: string | null;
  createdAt: string;
  updatedAt: string;
}

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the customer name').max(160),
  contactPerson: z.string().trim().max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Enter a valid phone number'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  city: z.string().trim().max(80),
  address: z.string().trim().max(500),
  gstin: z.string().trim().max(20),
});
type Values = z.infer<typeof schema>;

/** Create (no `customer`) or edit an existing customer. */
export function CustomerForm({ customer, onSaved }: { customer?: Customer; onSaved: (c: Customer) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name ?? '',
      contactPerson: customer?.contactPerson ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      city: customer?.city ?? '',
      address: customer?.address ?? '',
      gstin: customer?.gstin ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (v: Values) =>
      customer
        ? api<Customer>(`/customers/${customer.id}`, { method: 'PATCH', json: v })
        : api<Customer>('/customers', {
            method: 'POST',
            // The create endpoint treats missing optional fields as empty.
            json: Object.fromEntries(Object.entries(v).filter(([, val]) => val !== '')),
          }),
    onSuccess: (c) => {
      toast.success(customer ? 'Customer updated' : 'Customer added');
      onSaved(c);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
      <Field label="Customer / business name" error={errors.name?.message}>
        <Input {...register('name')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person" error={errors.contactPerson?.message}>
          <Input {...register('contactPerson')} />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" {...register('phone')} />
        </Field>
      </div>
      <Field label="Email (optional)" error={errors.email?.message}>
        <Input type="email" {...register('email')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors.city?.message}>
          <Input {...register('city')} />
        </Field>
        <Field label="GSTIN (optional)" error={errors.gstin?.message}>
          <Input className="uppercase" {...register('gstin')} />
        </Field>
      </div>
      <Field label="Address" error={errors.address?.message}>
        <Textarea rows={2} {...register('address')} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!!customer && !isDirty}>
        {customer ? 'Save changes' : 'Add customer'}
      </Button>
    </form>
  );
}
