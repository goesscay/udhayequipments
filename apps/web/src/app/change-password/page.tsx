'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type AuthResponse, type ChangePasswordInput } from '@udhay/shared';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Required after a new account or a reset; also reachable any time from the menu. */
export default function ChangePasswordPage() {
  const { user, loading, setSession, logout } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }
  const required = user.mustChangePassword;

  const onSubmit = async (v: ChangePasswordInput) => {
    setError(null);
    try {
      const res = await api<AuthResponse>('/auth/change-password', {
        method: 'POST',
        json: { currentPassword: v.currentPassword, newPassword: v.newPassword },
      });
      setSession(res);
      toast.success('Password changed');
      router.replace(res.user.permissions['dashboard.view'] ? '/dashboard' : '/queue');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm border bg-white p-6 sm:p-8">
        <Image src="/logo.png" alt="UDHAY" width={200} height={54} className="h-10 w-auto" priority />
        <div className="mt-8 flex items-center gap-2 text-brand-600">
          <KeyRound className="size-4" />
          <p className="text-[11px] font-medium uppercase tracking-[0.24em]">{required ? 'One more step' : 'Account'}</p>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{required ? 'Set your own password' : 'Change password'}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {required
            ? `Welcome${user.displayName ? `, ${user.displayName}` : ''}. Replace the temporary password you were given with one only you know.`
            : 'Choose a new password. You will stay signed in here and be signed out on other devices.'}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Field label={required ? 'Temporary password' : 'Current password'} error={errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" className="h-11" {...register('currentPassword')} />
          </Field>
          <Field label="New password" hint="10+ characters with a letter and a number" error={errors.newPassword?.message}>
            <Input type="password" autoComplete="new-password" className="h-11" {...register('newPassword')} />
          </Field>
          <Field label="Confirm new password" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" className="h-11" {...register('confirm')} />
          </Field>
          {error && <p className="border-l-2 border-bad bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
          <Button type="submit" size="lg" className="h-12 w-full" loading={isSubmitting}>
            Save password
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t pt-4 text-[13px]">
          {required ? (
            <button onClick={logout} className="text-muted hover:text-ink">
              Sign out
            </button>
          ) : (
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-muted hover:text-ink">
              <ArrowLeft className="size-4" /> Back
            </Link>
          )}
          <span className="text-[11px] text-muted">{user.employeeCode ?? user.email}</span>
        </div>
      </div>
    </div>
  );
}
