'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'udhay.notificationSound';
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Notification sound preference for this device (on unless switched off). */
export function useSoundEnabled() {
  const enabled = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => true,
  );
  const set = (on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Blocked storage: the choice lasts until the page reloads.
    }
    listeners.forEach((l) => l());
  };
  return [enabled, set] as const;
}

let ctx: AudioContext | null = null;

function audio() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/**
 * Browsers only allow sound after the person has touched the page, so the audio engine is
 * unlocked on the first tap or key press.
 */
export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    const c = audio();
    if (c?.state === 'suspended') void c.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** A short two-note chime, made in the browser so there is no audio file to load. */
export function playChime() {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const start = c.currentTime + 0.02;
  [880, 1318.5].forEach((freq, i) => {
    const t = start + i * 0.14;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}
