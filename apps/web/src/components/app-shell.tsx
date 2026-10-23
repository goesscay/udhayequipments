'use client';

import type { PermissionKey } from '@udhay/shared';
import {
  Bell,
  Building2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { href: '/queue', label: 'My Queue', icon: Inbox },
  { href: '/projects', label: 'Projects', icon: FolderKanban, permission: 'project.view' },
  { href: '/customers', label: 'Customers', icon: Building2, permission: 'customer.view' },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/users', label: 'Users', icon: Users, permission: 'user.view' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
];

const MORE: NavItem = { href: '/more', label: 'More', icon: Menu };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadCount();
  const items = NAV.filter((n) => !n.permission || can(n.permission));
  // The mobile bottom bar has room for four items: the first three, then "More" for the rest.
  // Notifications live in the mobile top bar instead.
  const mobileCandidates = items.filter((n) => n.href !== '/notifications');
  const mobileItems =
    mobileCandidates.length <= 4 ? mobileCandidates : [...mobileCandidates.slice(0, 3), MORE];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initials = user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-white md:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Image src="/logo.png" alt="UDHAY" width={150} height={40} className="h-9 w-auto" priority />
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink',
                isActive(href) && 'bg-brand-50 font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-600',
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === '/notifications' && unread > 0 && <CountBadge count={unread} className="ml-auto" />}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user?.name}</p>
              <p className="truncate text-[11px] text-muted">
                {user?.role.name}
                {user?.team ? ` · ${user.team.name}` : ''}
              </p>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/90 px-4 backdrop-blur md:hidden">
        <Image src="/logo.png" alt="UDHAY" width={120} height={32} className="h-7 w-auto" priority />
        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            className={cn('relative grid size-9 place-items-center rounded-lg text-muted', isActive('/notifications') && 'text-brand-600')}
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell className="size-5" />
            {unread > 0 && <CountBadge count={unread} className="absolute -right-0.5 -top-0.5" />}
          </Link>
          {can('project.create') && (
            <Link href="/projects/new" className="grid size-9 place-items-center rounded-lg bg-brand text-white" aria-label="New project">
              <Plus className="size-4" />
            </Link>
          )}
          <button onClick={logout} className="grid size-9 place-items-center rounded-lg text-muted" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-white md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, 1fr)` }}>
          {mobileItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 py-2 text-[11px] text-muted',
                isActive(href) && 'font-medium text-brand-600',
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
