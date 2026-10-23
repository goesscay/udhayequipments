'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Unread badge count; polled every 30s and refreshed when the tab regains focus. */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    select: (d) => d.unread,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') =>
      api(id === 'all' ? '/notifications/read-all' : `/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
