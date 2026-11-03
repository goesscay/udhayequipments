'use client';

import { BellRing, Download, Share, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { isIos, isStandalone, useInstallPrompt, usePushNotifications } from '@/lib/pwa';
import { playChime, useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';

/** Turn on phone notifications, the notification sound, and install the app, for this device. */
export function PhoneNotificationsCard({ className }: { className?: string }) {
  const push = usePushNotifications();
  const install = useInstallPrompt();
  const [soundOn, setSoundOn] = useSoundEnabled();
  const [busy, setBusy] = useState(false);
  // Worked out after mount: the server render cannot know the device.
  const [device, setDevice] = useState<{ ios: boolean; standalone: boolean } | null>(null);
  useEffect(() => setDevice({ ios: isIos(), standalone: isStandalone() }), []);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
    } catch (err) {
      toast.error((err as Error).message || 'Could not change notifications');
    } finally {
      setBusy(false);
    }
  };

  const iosNeedsHomeScreen = device?.ios && !device.standalone;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader title="Phone notifications & sound" />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">Notifications on this device</p>
            {push.state === 'on' && (
              <p className="text-[12px] text-muted">On. Alerts arrive even when the app is closed.</p>
            )}
            {push.state === 'off' && (
              <p className="text-[12px] text-muted">Get handoffs, assignments and deadline alerts as phone notifications.</p>
            )}
            {push.state === 'blocked' && (
              <p className="text-[12px] text-bad">
                Blocked for this site. Allow notifications for {location.host} in your phone or browser settings, then reload.
              </p>
            )}
            {push.state === 'unsupported' &&
              (iosNeedsHomeScreen ? (
                <p className="text-[12px] text-muted">
                  On iPhone, first add the app to your Home Screen: tap <Share className="inline size-3.5 align-[-2px]" /> Share,
                  then <b>Add to Home Screen</b>. Open UDHAY from the Home Screen and turn notifications on here.
                </p>
              ) : (
                <p className="text-[12px] text-muted">This browser cannot show notifications. Use Chrome, Edge, Firefox or Safari.</p>
              ))}
            <div className="mt-2 flex flex-wrap gap-2">
              {push.state === 'off' && (
                <Button size="sm" loading={busy} onClick={() => run(push.enable)}>
                  Turn on notifications
                </Button>
              )}
              {push.state === 'on' && (
                <>
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => run(push.test, 'Test sent: it should arrive in a few seconds')}>
                    Send a test
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(push.disable)}>
                    Turn off
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <Volume2 className="mt-0.5 size-5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">Sound for new notifications</span>
            <span className="block text-[12px] text-muted">Plays a chime while the app is open.</span>
          </span>
          <span className="relative mt-0.5 inline-flex shrink-0">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={soundOn}
              onChange={(e) => {
                setSoundOn(e.target.checked);
                if (e.target.checked) playChime();
              }}
            />
            <span className="h-6 w-11 rounded-none bg-line transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
            <span className="absolute left-0.5 top-0.5 size-5 rounded-none bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
        </label>

        {install.available && (
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Install the app</p>
              <p className="text-[12px] text-muted">Opens full screen from your home screen, like any other app.</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={install.install}>
                Install UDHAY
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** One-line prompt at the top of Notifications until phone notifications are on for this device. */
export function PushBanner() {
  const push = usePushNotifications();
  const [busy, setBusy] = useState(false);
  if (push.state !== 'off') return null;
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-50 px-4 py-3">
      <BellRing className="size-5 shrink-0 text-brand-600" />
      <p className="min-w-0 flex-1 text-[13px]">Get these as phone notifications, even when the app is closed.</p>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await push.enable();
          } catch (err) {
            toast.error((err as Error).message || 'Could not turn on notifications');
          } finally {
            setBusy(false);
          }
        }}
      >
        Turn on
      </Button>
    </div>
  );
}
