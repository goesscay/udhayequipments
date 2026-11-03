'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { registerServiceWorker, setAppBadge, syncPushSubscription } from './pwa';
import { playChime, unlockAudioOnFirstTouch, useSoundEnabled } from './sound';

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

/**
 * While the app is open: plays the chime and shows a toast when the unread count goes up, keeps
 * the app-icon badge in step, and refreshes straight away when a push arrives.
 */
export function useNotificationAlerts(unread: number | undefined) {
  const qc = useQueryClient();
  const router = useRouter();
  const [soundOn] = useSoundEnabled();
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    registerServiceWorker();
    unlockAudioOnFirstTouch();
    void syncPushSubscription();
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent<{ type?: string; url?: string }>) => {
      if (e.data?.type === 'push') void qc.invalidateQueries({ queryKey: ['notifications'] });
      if (e.data?.type === 'open' && e.data.url) router.push(new URL(e.data.url).pathname);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [qc, router]);

  useEffect(() => {
    if (unread === undefined) return;
    setAppBadge(unread);
    const before = previous.current;
    previous.current = unread;
    if (before === undefined || unread <= before) return;
    if (soundOn) playChime();
    const added = unread - before;
    toast(added === 1 ? 'New notification' : `${added} new notifications`, {
      action: { label: 'View', onClick: () => router.push('/notifications') },
    });
  }, [unread, soundOn, router]);
}
