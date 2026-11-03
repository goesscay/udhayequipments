'use client';

import { useQuery } from '@tanstack/react-query';
import { DEFAULT_WORKFLOW, resolveWorkflow, type ResolvedWorkflow, type WorkflowConfig } from '@udhay/shared';
import { useMemo } from 'react';
import { api } from './api';
import { useAuth } from './auth';

/**
 * The workflow as configured in Settings → Workflow (stage names, teams, switched-off stages).
 * Renders with the built-in workflow until the config arrives, so pages never wait on it.
 */
export function useWorkflow(): ResolvedWorkflow {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['workflow'],
    queryFn: () => api<WorkflowConfig>('/workflow'),
    enabled: !!user && !user.mustChangePassword,
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (data ? resolveWorkflow(data) : DEFAULT_WORKFLOW), [data]);
}
