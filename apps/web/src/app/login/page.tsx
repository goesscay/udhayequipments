'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@udhay/shared';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useAuth } from '@/lib/auth';

/**
 * Hero photo: a commercial combi oven under a stainless extraction canopy.
 * Hotlinked from Unsplash's CDN (sized there) with the credit their licence asks for.
 */
const PHOTO = {
  src: 'https://images.unsplash.com/photo-1790156590790-fbd2239d1ecf?auto=format&fit=crop&w=1600&q=80',
  alt: 'Stainless steel commercial oven under an extraction canopy in a professional kitchen',
  author: 'Ceba Solutions',
  authorUrl: 'https://unsplash.com/@professional_photos_online?utm_source=udhay_project_tracker&utm_medium=referral',
  unsplashUrl: 'https://unsplash.com/?utm_source=udhay_project_tracker&utm_medium=referral',
};

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (user) router.replace(user.mustChangePassword ? '/change-password' : user.permissions['dashboard.view'] ? '/dashboard' : '/queue');
  }, [user, router]);

  const onSubmit = async (values: LoginInput) => {
    setError(null);
    try {
      await login(values.login, values.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* Photo panel: a banner on phones, the left half on desktop */}
      <section className="relative h-56 shrink-0 overflow-hidden bg-ink sm:h-72 lg:h-auto lg:w-[56%]">
        <Image src={PHOTO.src} alt={PHOTO.alt} fill priority unoptimized sizes="(min-width: 1024px) 56vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20 lg:bg-gradient-to-r lg:from-black/80 lg:via-black/45 lg:to-black/10" />
        <div className="absolute inset-x-0 top-0 h-1 bg-brand" />

        <div className="relative flex h-full flex-col justify-end p-6 sm:p-10 lg:justify-between lg:p-14">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.32em] text-brand lg:block">Est. 1991</p>
          <div className="max-w-lg">
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-brand lg:hidden">Est. 1991</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl lg:text-[2.6rem]">
              Commercial kitchens,
              <br />
              built to perform.
            </h1>
            <div className="mt-5 hidden h-px w-16 bg-brand lg:block" />
            <p className="mt-5 hidden max-w-md text-[15px] leading-relaxed text-white/75 lg:block">
              Every project from the first site visit to the final handover: one place, every team, always up to date.
            </p>
          </div>
          <p className="mt-4 text-[10px] text-white/55 lg:mt-0">
            Photo by{' '}
            <a href={PHOTO.authorUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-white hover:underline">
              {PHOTO.author}
            </a>{' '}
            on{' '}
            <a href={PHOTO.unsplashUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-white hover:underline">
              Unsplash
            </a>
          </p>
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-sm">
          <Image src="/logo.png" alt="UDHAY Hospitality Equipment & Service" width={260} height={70} className="h-12 w-auto sm:h-14" priority />

          <div className="mt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-brand-600">Project Tracker</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-[13px] text-muted">Sign in with your employee code (e.g. EMP005), mobile number or email.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            <Field label="Employee code, mobile or email" error={errors.login?.message}>
              <Input autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="e.g. EMP005" className="h-11" {...register('login')} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-11 pr-11"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="border-l-2 border-bad bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
            <Button type="submit" size="lg" className="group h-12 w-full text-[15px]" loading={isSubmitting}>
              Sign in
              {!isSubmitting && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>

          <p className="mt-12 border-t pt-5 text-[11px] text-muted">
            UDHAY Hospitality Equipment &amp; Service · Forgot your password? Ask your administrator to reset it.
          </p>
        </div>
      </section>
    </div>
  );
}
