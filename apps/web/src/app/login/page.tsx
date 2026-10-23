'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@udhay/shared';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (user) router.replace(user.permissions['dashboard.view'] ? '/dashboard' : '/queue');
  }, [user, router]);

  const onSubmit = async (values: LoginInput) => {
    setError(null);
    try {
      await login(values.email, values.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="UDHAY Hospitality Equipment & Service" width={260} height={70} className="h-14 w-auto" priority />
          <div className="mt-6 h-px w-12 bg-brand" />
          <h1 className="mt-6 text-lg font-semibold">Project Tracker</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="username" inputMode="email" {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          {error && <p className="rounded-lg bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.2em] text-muted">Est. 1991</p>
      </div>
    </div>
  );
}
