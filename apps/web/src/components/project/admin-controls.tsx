'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { PROJECT_STATUSES, TEAMS, TEAM_LABELS, type ProjectDetail, type ProjectStatus, type TeamCode } from '@udhay/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useWorkflow } from '@/lib/workflow';

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  LOST: 'Lost',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export interface PickUser {
  id: string;
  name: string;
  displayName?: string | null;
  isActive: boolean;
  team: { code: TeamCode; name: string } | null;
}

/** Active users for pickers (Super Admins see everyone). */
export function useAllUsers(enabled = true) {
  return useQuery({ queryKey: ['users'], queryFn: () => api<PickUser[]>('/users'), enabled });
}

/**
 * Super Admin controls: change status (including reopening), jump to any stage, and hand the
 * current stage to any team or person. Every change needs a reason and shows on the timeline.
 */
export function AdminControls({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const open = project.status === 'ACTIVE' || project.status === 'ON_HOLD';
  return (
    <div className="space-y-6">
      <StatusSection project={project} onDone={onDone} />
      {open ? (
        <>
          <StageSection project={project} onDone={onDone} />
          <HandOverSection project={project} onDone={onDone} />
        </>
      ) : (
        <p className="border bg-surface px-3 py-2 text-[12px] text-muted">
          To move this project to another stage or hand it to someone, first change its status to Active.
        </p>
      )}
    </div>
  );
}

function useOverride(project: ProjectDetail, path: string, success: string, onDone: () => void) {
  return useMutation({
    mutationFn: (json: object) => api(`/projects/${project.id}/${path}`, { method: 'POST', json }),
    onSuccess: () => {
      toast.success(success);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <p className="text-[12px] text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function StatusSection({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [reason, setReason] = useState('');
  const save = useOverride(project, 'status', 'Status changed', onDone);
  const closedNow = !['ACTIVE', 'ON_HOLD'].includes(project.status);
  return (
    <Section
      title="Status"
      hint={
        closedNow
          ? 'Setting it back to Active or On hold reopens the project at the stage it closed in.'
          : 'Lost, Completed and Cancelled close the project.'
      }
    >
      <Field label="New status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
              {s === project.status ? ' (now)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        variant={status === 'CANCELLED' || status === 'LOST' ? 'danger' : 'primary'}
        loading={save.isPending}
        disabled={status === project.status || !reason.trim()}
        onClick={() => save.mutate({ status, reason: reason.trim() })}
      >
        Change status to {STATUS_LABELS[status]}
      </Button>
    </Section>
  );
}

function StageSection({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const wf = useWorkflow();
  const [stage, setStage] = useState(project.currentStage);
  const [reason, setReason] = useState('');
  const save = useOverride(project, 'move', 'Moved to the new stage', onDone);
  return (
    <Section
      title="Move to stage"
      hint="Skips the normal checks (documents, payments, approvals). The receiving team is notified."
    >
      <Field label="Stage">
        <Select value={stage} onChange={(e) => setStage(e.target.value)}>
          {wf.stages.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label} · {TEAM_LABELS[s.team]}
              {s.code === project.currentStage ? ' (now)' : s.enabled ? '' : ' (off)'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        variant="secondary"
        loading={save.isPending}
        disabled={stage === project.currentStage || !reason.trim()}
        onClick={() => save.mutate({ stage, reason: reason.trim() })}
      >
        Move to {wf.stage(stage).label}
      </Button>
    </Section>
  );
}

function HandOverSection({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const { data: users } = useAllUsers();
  const [team, setTeam] = useState<TeamCode>(project.currentTeam);
  const [userId, setUserId] = useState(project.assignee?.id ?? '');
  const [reason, setReason] = useState('');
  const save = useOverride(project, 'reassign', 'Handed over', onDone);
  const people = (users ?? []).filter((u) => u.isActive && (u.team?.code === team || !u.team));
  const unchanged = team === project.currentTeam && (userId || null) === (project.assignee?.id ?? null);
  return (
    <Section
      title="Hand to a department or person"
      hint={`Now with ${TEAM_LABELS[project.currentTeam]}${project.assignee ? ` · ${project.assignee.name}` : ' (unassigned)'}. The new team sees it in their queue and can act on this stage.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Department">
          <Select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value as TeamCode);
              setUserId('');
            }}
          >
            {TEAMS.map((t) => (
              <option key={t} value={t}>{TEAM_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Person">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Anyone in the team</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.name}
                {u.team ? '' : ' (no team)'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note (optional)">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        variant="secondary"
        loading={save.isPending}
        disabled={unchanged}
        onClick={() => save.mutate({ team, userId: userId || undefined, reason: reason.trim() || undefined })}
      >
        Hand over
      </Button>
    </Section>
  );
}
