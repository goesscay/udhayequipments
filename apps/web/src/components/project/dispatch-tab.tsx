'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { DispatchTripRow, TripStatus } from '@udhay/shared';
import { Camera, Phone, Plus, Truck } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton, type BadgeTone } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { uploadDocument } from '@/lib/upload';
import { formatDate } from '@/lib/utils';
import { Notice, todayInput, useProjectRefresh } from './shared';

interface DispatchData {
  trips: DispatchTripRow[];
  canManage: boolean;
  canDispatchNow: boolean;
  dispatchBlocker: string | null;
}

export const TRIP_TONE: Record<TripStatus, BadgeTone> = {
  PLANNED: 'blue',
  IN_TRANSIT: 'amber',
  DELIVERED: 'green',
  CANCELLED: 'neutral',
};
export const TRIP_LABEL: Record<TripStatus, string> = {
  PLANNED: 'planned',
  IN_TRANSIT: 'in transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export function DispatchTab({ projectId, active }: { projectId: string; active: boolean }) {
  const refresh = useProjectRefresh(projectId);
  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'dispatch'],
    queryFn: () => api<DispatchData>(`/projects/${projectId}/dispatch`),
  });
  const [planning, setPlanning] = useState(false);
  const [delivering, setDelivering] = useState<DispatchTripRow | null>(null);

  const act = useMutation({
    mutationFn: (path: string) => api(path, { method: 'POST', json: {} }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="m-4 h-40" />;
  const manage = data.canManage && active;

  return (
    <div>
      <div className="space-y-2 border-b p-4">
        {!data.canDispatchNow && <Notice tone="blue">Trips can be planned now; goods leave once production is marked complete.</Notice>}
        {data.canDispatchNow && data.dispatchBlocker && <Notice>{data.dispatchBlocker}. Dispatch is on hold until it is recorded.</Notice>}
        {manage && (
          <Button variant="secondary" onClick={() => setPlanning(true)}>
            <Plus /> Plan a trip
          </Button>
        )}
      </div>

      {!data.trips.length ? (
        <EmptyState title="No trips planned" hint="Large jobs can go in several trips." />
      ) : (
        <ul className="divide-y">
          {data.trips.map((t) => (
            <li key={t.id} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  <Truck className="size-4 text-muted" /> Trip {t.tripNo} · {formatDate(t.plannedDate)}
                </p>
                <Badge tone={TRIP_TONE[t.status]}>{TRIP_LABEL[t.status]}</Badge>
              </div>
              <p className="text-[12px] text-muted">
                {[t.vehicleNo, t.driverName].filter(Boolean).join(' · ') || 'Vehicle and driver not set'}
                {t.driverPhone && (
                  <a href={`tel:${t.driverPhone}`} className="ml-2 inline-flex items-center gap-1 text-ink">
                    <Phone className="size-3" />
                    {t.driverPhone}
                  </a>
                )}
              </p>
              {(t.challanNo || t.ewayBillNo) && (
                <p className="text-[12px] text-muted">
                  {t.challanNo && `DC ${t.challanNo}`}
                  {t.challanNo && t.ewayBillNo && ' · '}
                  {t.ewayBillNo && `E-way bill ${t.ewayBillNo}`}
                </p>
              )}
              {t.itemsNote && <p className="whitespace-pre-line text-[12px]">{t.itemsNote}</p>}
              {t.status === 'DELIVERED' && (
                <p className="text-[12px] text-ok">
                  Delivered {formatDate(t.deliveredAt, true)} · received by {t.receivedByName}
                </p>
              )}
              {manage && (t.status === 'PLANNED' || t.status === 'IN_TRANSIT') && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {t.status === 'PLANNED' && (
                    <Button
                      size="sm"
                      disabled={!data.canDispatchNow || !!data.dispatchBlocker}
                      loading={act.isPending && act.variables === `/dispatch/trips/${t.id}/dispatch`}
                      onClick={() => act.mutate(`/dispatch/trips/${t.id}/dispatch`)}
                    >
                      Mark dispatched
                    </Button>
                  )}
                  {t.status === 'IN_TRANSIT' && (
                    <Button size="sm" onClick={() => setDelivering(t)}>
                      Record delivery
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-bad"
                    onClick={() => confirm(`Cancel trip ${t.tripNo}?`) && act.mutate(`/dispatch/trips/${t.id}/cancel`)}
                  >
                    Cancel trip
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={planning} onClose={() => setPlanning(false)} title="Plan a dispatch trip">
        <PlanTripForm
          projectId={projectId}
          onDone={() => {
            setPlanning(false);
            refresh();
          }}
        />
      </Sheet>
      <Sheet open={!!delivering} onClose={() => setDelivering(null)} title={`Record delivery · trip ${delivering?.tripNo ?? ''}`}>
        {delivering && (
          <DeliverForm
            projectId={projectId}
            trip={delivering}
            onDone={() => {
              setDelivering(null);
              refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function PlanTripForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [f, setF] = useState({
    plannedDate: todayInput(),
    vehicleNo: '',
    driverName: '',
    driverPhone: '',
    challanNo: '',
    ewayBillNo: '',
    itemsNote: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/dispatch/trips`, {
        method: 'POST',
        json: {
          ...Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim() !== '')),
          plannedDate: new Date(`${f.plannedDate}T09:00:00`).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success('Trip planned');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Planned date">
          <Input type="date" value={f.plannedDate} onChange={set('plannedDate')} />
        </Field>
        <Field label="Vehicle no.">
          <Input className="uppercase" value={f.vehicleNo} onChange={set('vehicleNo')} maxLength={30} />
        </Field>
        <Field label="Driver">
          <Input value={f.driverName} onChange={set('driverName')} maxLength={120} />
        </Field>
        <Field label="Driver phone">
          <Input type="tel" value={f.driverPhone} onChange={set('driverPhone')} maxLength={20} />
        </Field>
        <Field label="Delivery challan no.">
          <Input value={f.challanNo} onChange={set('challanNo')} maxLength={60} />
        </Field>
        <Field label="E-way bill no.">
          <Input value={f.ewayBillNo} onChange={set('ewayBillNo')} maxLength={60} />
        </Field>
      </div>
      <Field label="Items on this trip (optional)">
        <Textarea rows={3} value={f.itemsNote} onChange={set('itemsNote')} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending} disabled={!f.plannedDate}>
        Plan trip
      </Button>
    </form>
  );
}

function DeliverForm({ projectId, trip, onDone }: { projectId: string; trip: DispatchTripRow; onDone: () => void }) {
  const pad = useRef<SignaturePadHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [signed, setSigned] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const proof = photo ?? (await pad.current?.toFile(`pod-trip-${trip.tripNo}.png`));
      if (!proof) throw new Error('Get a signature or take a photo of the signed challan');
      const doc = await uploadDocument(projectId, 'POD', proof);
      await api(`/dispatch/trips/${trip.id}/deliver`, {
        method: 'POST',
        json: { receivedByName: name.trim(), podDocumentId: doc.id },
      });
    },
    onSuccess: () => {
      toast.success('Delivery recorded');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Received by (name)">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>
      {!photo && (
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium">Customer signature</span>
          <SignaturePad ref={pad} onChange={(empty) => setSigned(!empty)} />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      {photo ? (
        <p className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[13px]">
          <span className="truncate">{photo.name}</span>
          <button type="button" className="text-muted underline" onClick={() => setPhoto(null)}>
            Use signature instead
          </button>
        </p>
      ) : (
        <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
          <Camera /> Or photograph the signed challan
        </Button>
      )}
      <Button type="submit" className="w-full" loading={save.isPending} disabled={name.trim().length < 2 || (!photo && !signed)}>
        Confirm delivery
      </Button>
    </form>
  );
}
