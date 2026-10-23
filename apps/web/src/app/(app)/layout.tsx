'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

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
  return <AppShell>{children}</AppShell>;
}
