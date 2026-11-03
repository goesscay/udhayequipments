'use client';

import { ChevronRight, KeyRound, LogOut } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, visibleNav } from '@/components/app-shell';
import { PhoneNotificationsCard } from '@/components/phone-notifications';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

/** Mobile overflow menu: every section the bottom bar has no room for. */
export default function MorePage() {
  const { user, logout } = useAuth();
  const items = visibleNav(user);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="More" subtitle={user ? `${user.name} · ${user.role.name}` : undefined} />
      <Card className="divide-y overflow-hidden">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
            <Icon className="size-5 text-muted" />
            <span className="flex-1 text-[15px]">{label}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
      </Card>
      <PhoneNotificationsCard className="mt-4" />
      <Card className="mt-4 divide-y overflow-hidden">
        <Link href="/change-password" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
          <KeyRound className="size-5 text-muted" />
          <span className="flex-1 text-[15px]">Change password</span>
          <ChevronRight className="size-4 text-muted" />
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-bad hover:bg-surface">
          <LogOut className="size-5" />
          <span className="text-[15px]">Sign out</span>
        </button>
      </Card>
    </div>
  );
}
