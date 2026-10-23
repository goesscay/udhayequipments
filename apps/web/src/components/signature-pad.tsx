'use client';

import { Eraser } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  /** PNG of the signature on a white background, or null if nothing was drawn. */
  toFile: (name: string) => Promise<File | null>;
  clear: () => void;
}

/** Finger / stylus / mouse signature capture for proof of delivery and handover. */
export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string; onChange?: (empty: boolean) => void }>(
  function SignaturePad({ className, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    const setup = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#1F2328';
    }, []);

    useEffect(() => {
      setup();
    }, [setup]);

    const markDrawn = () => {
      if (empty) {
        setEmpty(false);
        onChange?.(false);
      }
    };

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const clear = () => {
      setup();
      setEmpty(true);
      onChange?.(true);
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => empty,
      clear,
      toFile: async (name) => {
        if (empty || !canvasRef.current) return null;
        const blob = await new Promise<Blob | null>((r) => canvasRef.current!.toBlob(r, 'image/png'));
        return blob ? new File([blob], name, { type: 'image/png' }) : null;
      },
    }));

    return (
      <div className={cn('relative', className)}>
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg border border-dashed border-muted/40 bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = e.currentTarget.getContext('2d')!;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            markDrawn();
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
          }}
          onPointerLeave={() => {
            drawing.current = false;
            last.current = null;
          }}
          aria-label="Signature area"
        />
        {empty ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-muted/70">Sign here</span>
        ) : (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[12px] text-muted shadow-sm hover:text-ink"
          >
            <Eraser className="size-3.5" /> Clear
          </button>
        )}
      </div>
    );
  },
);
