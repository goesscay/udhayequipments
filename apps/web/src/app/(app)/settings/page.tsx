'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { JobsStatus } from '@/components/settings/jobs-status';
import { RolesEditor } from '@/components/settings/roles-editor';
import { StageTargets } from '@/components/settings/stage-targets';
import { Card, EmptyState } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'roles', label: 'Roles & permissions', permission: 'role.manage' },
  { id: 'stages', label: 'Stage targets', permission: 'settings.manage' },
  { id: 'jobs', label: 'Background jobs', permission: 'settings.manage' },
] as const;

export default function SettingsPage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.permission));
  const [tab, setTab] = useState<(typeof TABS)[number]['id'] | undefined>(tabs[0]?.id);

  if (!tabs.length) {
    return (
      <Card>
        <EmptyState title="No settings available" hint="Ask a Super Admin for access." />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Who can do what, and how long each stage should take" />
      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium',
              tab === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'roles' && <RolesEditor />}
      {tab === 'stages' && <StageTargets />}
      {tab === 'jobs' && <JobsStatus />}
    </>
  );
}
