'use client';

import type { PermissionKey, SessionUser, TeamCode } from '@udhay/shared';
import {
  Bell,
  Building2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  BarChart3,
  Settings,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  /** Team-owned sections: shown to that team, or to anyone holding the permission with ALL scope. */
  team?: TeamCode;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { href: '/queue', label: 'My Queue', icon: Inbox },
  { href: '/projects', label: 'Projects', icon: FolderKanban, permission: 'project.view' },
  { href: '/customers', label: 'Customers', icon: Building2, permission: 'customer.view' },
  { href: '/dispatch', label: 'Dispatch', icon: Truck, permission: 'dispatch.manage', team: 'DISPATCH' },
  { href: '/service', label: 'Service', icon: Wrench, permission: 'service.view' },
  { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'report.view' },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/users', label: 'Users', icon: Users, permission: 'user.view' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
];

const MORE: NavItem = { href: '/more', label: 'More', icon: Menu };

export function visibleNav(user: SessionUser | null): NavItem[] {
  if (!user) return [];
  return NAV.filter((n) => {
    if (!n.permission) return true;
    const scope = user.permissions[n.permission];
    if (!scope) return false;
    return !n.team || scope === 'ALL' || user.team?.code === n.team || user.permissions['dashboard.view'] === 'ALL';
  });
}

const COLLAPSE_KEY = 'udhay.sidebarCollapsed';

/** Desktop sidebar width preference, remembered per browser (falls back to expanded). */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // Private mode or blocked storage: the toggle still works for this visit.
      }
      return !c;
    });
  }, []);
  // Ctrl/Cmd + B toggles, like most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return [collapsed, toggle] as const;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadCount();
  const items = visibleNav(user);
  // The mobile bottom bar has room for four items: the first three, then "More" for the rest.
  // Notifications live in the mobile top bar instead.
  const mobileCandidates = items.filter((n) => n.href !== '/notifications');
  const mobileItems =
    mobileCandidates.length <= 4 ? mobileCandidates : [...mobileCandidates.slice(0, 3), MORE];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initials = user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={cn('min-h-dvh transition-[padding] duration-200', collapsed ? 'md:pl-16' : 'md:pl-60')}>
      {/* Desktop sidebar: full width or a 64px icon rail */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-white transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center border-b', collapsed ? 'justify-center' : 'px-5')}>
          {collapsed ? (
            <Image src="/icons/icon-192.png" alt="UDHAY" width={32} height={32} className="size-8" priority />
          ) : (
            <Image src="/logo.png" alt="UDHAY" width={150} height={40} className="h-9 w-auto" priority />
          )}
        </div>
        <nav className={cn('flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden', collapsed ? 'px-2 py-3' : 'p-3')}>
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                'relative flex items-center gap-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive(href) && 'bg-brand-50 font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-600',
                isActive(href) && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand',
              )}
            >
              <Icon className={cn('shrink-0', collapsed ? 'size-5' : 'size-4')} />
              {!collapsed && label}
              {href === '/notifications' && unread > 0 && (
                <CountBadge count={unread} className={collapsed ? 'absolute right-1 top-0.5' : 'ml-auto'} />
              )}
            </Link>
          ))}
        </nav>
        <div className={cn('border-t', collapsed ? 'space-y-1 px-2 py-3' : 'p-3')}>
          {collapsed ? (
            <>
              <div
                className="mx-auto grid size-8 place-items-center bg-ink text-[11px] font-semibold text-white"
                title={`${user?.name} · ${user?.role.name}`}
              >
                {initials}
              </div>
              <button
                onClick={logout}
                className="grid h-9 w-full place-items-center text-muted hover:bg-surface hover:text-ink"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="grid size-8 place-items-center bg-ink text-[11px] font-semibold text-white">{initials}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{user?.name}</p>
                <p className="truncate text-[11px] text-muted">
                  {user?.role.name}
                  {user?.team ? ` · ${user.team.name}` : ''}
                </p>
              </div>
              <button onClick={logout} className="p-1.5 text-muted hover:bg-surface hover:text-ink" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className={cn(
              'flex h-9 w-full items-center gap-3 text-[13px] text-muted hover:bg-surface hover:text-ink',
              collapsed ? 'justify-center' : 'mt-1 px-3',
            )}
            title={collapsed ? 'Expand menu (Ctrl+B)' : 'Collapse menu (Ctrl+B)'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
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
        'tabular grid h-[18px] min-w-[18px] place-items-center rounded-none bg-bad px-1 text-[10px] font-semibold leading-none text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
