'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';

/* ── Service worker ─────────────────────────────────────────────────────────── */

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

/* ── Install ("Add to Home screen") ─────────────────────────────────────────── */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emitInstall();
  });
}

/** Android / desktop Chrome offer an install prompt; iPhone needs Share → Add to Home Screen. */
export function useInstallPrompt() {
  const available = useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => installEvent !== null,
    () => false,
  );
  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => undefined);
    installEvent = null;
    emitInstall();
  }, []);
  return { available, install };
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/* ── Push notifications ─────────────────────────────────────────────────────── */

export type PushState =
  | 'loading'
  /** Browser cannot do push at all (or iPhone outside the home-screen app). */
  | 'unsupported'
  | 'blocked'
  | 'off'
  | 'on';

function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function base64UrlToBytes(value: string) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  return api('/push/subscribe', {
    method: 'POST',
    json: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    },
  });
}

/** Re-links this device to whoever is signed in, so pushes follow the current user. */
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await saveSubscription(sub).catch(() => undefined);
}

/** Called on sign-out: this device stops receiving that user's notifications. */
export async function forgetPushDevice() {
  const sub = await currentSubscription().catch(() => null);
  if (sub) await api('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => undefined);
}

/** Lets every copy of the hook (banner and settings card) follow a change made in one of them. */
const PUSH_CHANGED = 'udhay:push-changed';

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');

  const refresh = useCallback(async () => {
    if (!pushSupported()) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('blocked');
    const sub = await currentSubscription().catch(() => null);
    setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(PUSH_CHANGED, onChange);
    return () => window.removeEventListener(PUSH_CHANGED, onChange);
  }, [refresh]);

  const enable = useCallback(async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      window.dispatchEvent(new Event(PUSH_CHANGED));
      return false;
    }
    registerServiceWorker();
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api<{ publicKey: string }>('/push/public-key');
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another key (e.g. a reset server) cannot be used.
    const key = sub?.options.applicationServerKey;
    if (sub && key && new Uint8Array(key).join() !== base64UrlToBytes(publicKey).join()) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
    await saveSubscription(sub);
    window.dispatchEvent(new Event(PUSH_CHANGED));
    return true;
  }, []);

  const disable = useCallback(async () => {
    const sub = await currentSubscription();
    if (sub) {
      await api('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => undefined);
      await sub.unsubscribe();
    }
    window.dispatchEvent(new Event(PUSH_CHANGED));
  }, []);

  const test = useCallback(() => api('/push/test', { method: 'POST' }), []);

  return { state, enable, disable, test };
}

/* ── App icon badge ─────────────────────────────────────────────────────────── */

export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => undefined);
  else nav.clearAppBadge?.().catch(() => undefined);
}
