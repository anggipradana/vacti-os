'use client';

import * as React from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, X } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/cn';
import { tx, type Locale } from '../../lib/i18n';

const ZOOM_STEP = 0.2;

interface ZoomPanProps {
  children: React.ReactNode;
  locale: Locale;
  className?: string;
  /** Viewport height in px (default 460). */
  height?: number;
  minScale?: number;
  maxScale?: number;
}

/**
 * Wraps arbitrary children (an SVG or block of markup) in a fixed-height, overflow-hidden viewport and
 * makes it zoomable (buttons + cursor-centered wheel) and pannable (drag). All transforms are applied via
 * a single inner div (translate + scale, transformOrigin 0 0); no external dependency. SSR-safe: window is
 * never touched during render and listeners are attached in effects / on the element.
 */
export function ZoomPan({ children, locale, className, height = 460, minScale = 0.4, maxScale = 4 }: ZoomPanProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);
  const [tx0, setTx0] = React.useState(0);
  const [ty0, setTy0] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const dragOrigin = React.useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const clamp = React.useCallback((s: number) => Math.min(maxScale, Math.max(minScale, s)), [minScale, maxScale]);

  const reset = React.useCallback(() => {
    setScale(1);
    setTx0(0);
    setTy0(0);
  }, []);

  // Reset the view when entering/leaving fullscreen so the graph fits the new viewport size.
  const toggleFullscreen = React.useCallback(() => {
    reset();
    setFullscreen((v) => !v);
  }, [reset]);

  // Exit fullscreen on Escape.
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, reset]);

  // Zoom toward an anchor point (in viewport-local coordinates) so that point stays put on screen.
  const zoomFromButton = React.useCallback(
    (delta: number) => {
      const el = viewportRef.current;
      const cx = el ? el.clientWidth / 2 : 0;
      const cy = el ? el.clientHeight / 2 : 0;
      setScale((prev) => {
        const next = clamp(prev + delta);
        if (next === prev) return prev;
        const ratio = next / prev;
        setTx0((x) => cx - (cx - x) * ratio);
        setTy0((y) => cy - (cy - y) * ratio);
        return next;
      });
    },
    [clamp],
  );

  // Wheel zoom centered on the cursor. Attached natively (non-passive) so preventDefault works.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;
      const anchorY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 / (1 + ZOOM_STEP);
      setScale((prev) => {
        const next = clamp(prev * factor);
        if (next === prev) return prev;
        const ratio = next / prev;
        setTx0((x) => anchorX - (anchorX - x) * ratio);
        setTy0((y) => anchorY - (anchorY - y) * ratio);
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { px: e.clientX, py: e.clientY, x: tx0, y: ty0 };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setTx0(origin.x + (e.clientX - origin.px));
    setTy0(origin.y + (e.clientY - origin.py));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragOrigin.current = null;
    setDragging(false);
  };

  const pct = Math.round(scale * 100);

  const controls = (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-surface/90 p-1 shadow-sm backdrop-blur">
      <span className="px-1.5 text-xs font-medium tabular-nums text-fg-muted" aria-live="polite">
        {pct}%
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => zoomFromButton(-ZOOM_STEP)}
        aria-label={tx(locale, 'Zoom out', 'Perkecil')}
        title={tx(locale, 'Zoom out', 'Perkecil')}
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => zoomFromButton(ZOOM_STEP)}
        aria-label={tx(locale, 'Zoom in', 'Perbesar')}
        title={tx(locale, 'Zoom in', 'Perbesar')}
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-7 p-0"
        onClick={reset}
        aria-label={tx(locale, 'Reset view', 'Atur ulang tampilan')}
        title={tx(locale, 'Reset view', 'Atur ulang tampilan')}
      >
        <RotateCcw className="size-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-7 p-0"
        onClick={toggleFullscreen}
        aria-label={
          fullscreen ? tx(locale, 'Exit full screen', 'Keluar layar penuh') : tx(locale, 'Full screen', 'Layar penuh')
        }
        title={
          fullscreen ? tx(locale, 'Exit full screen', 'Keluar layar penuh') : tx(locale, 'Full screen', 'Layar penuh')
        }
      >
        {fullscreen ? <X className="size-4" /> : <Maximize2 className="size-4" />}
      </Button>
    </div>
  );

  const viewport = (
    <div
      ref={viewportRef}
      className={cn('h-full w-full touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="w-full"
        style={{ transform: `translate(${tx0}px, ${ty0}px) scale(${scale})`, transformOrigin: '0 0' }}
      >
        {children}
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-4 z-[100] overflow-hidden rounded-md border border-border bg-surface shadow-lg">
        {controls}
        {viewport}
      </div>
    );
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-md border border-border bg-surface', className)}
      style={{ height }}
    >
      {controls}
      {viewport}
    </div>
  );
}
