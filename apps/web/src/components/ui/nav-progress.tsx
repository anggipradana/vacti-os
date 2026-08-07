'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A lightweight top-of-page progress bar shown during client navigations, so moving between pages never
 * looks frozen ("grak-grek"). It starts on a same-origin link click and finishes when the resolved route
 * actually changes. No dependency - just a fixed bar that trickles toward ~90% then snaps to 100%. Pairs
 * with the per-action pending overlays (e.g. leak search) - this covers the navigation case app-wide.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const trickle = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (trickle.current) clearInterval(trickle.current);
  }, []);

  const finish = React.useCallback(() => {
    clearTimers();
    setWidth(100);
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250),
    );
  }, [clearTimers]);

  const start = React.useCallback(() => {
    clearTimers();
    setVisible(true);
    setWidth(8);
    trickle.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + Math.max(0.5, (90 - w) * 0.08) : w));
    }, 200);
    // Safety net: a same-route server action (a form submit that revalidates WITHOUT navigating) never
    // fires the route-change finish, so auto-finish after a bit to avoid a stuck bar.
    timers.current.push(setTimeout(() => finish(), 12000));
  }, [clearTimers, finish]);

  // Start on same-origin left-clicks of a real link (navigation begins before the route changes).
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || a.hasAttribute('download')) return;
      try {
        const url = new URL(a.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.search === location.search) return; // same page
        start();
      } catch {
        /* not a navigable URL */
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [start]);

  // Also start on form submits (server-action buttons: scan/review/save/delete), so EVERY wait
  // shows the bar, not just link navigations. The route-change effect or the 12s safety net finishes it.
  React.useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement | null;
      if (!form || form.getAttribute('data-no-progress') !== null) return;
      start();
    };
    document.addEventListener('submit', onSubmit, true);
    return () => document.removeEventListener('submit', onSubmit, true);
  }, [start]);

  // Finish whenever the resolved route (path or query) changes.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    finish();
  }, [pathname, searchParams, finish]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]" aria-hidden="true">
      <div
        className="h-full bg-accent shadow-[0_0_10px_2px_rgba(59,130,246,0.8)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
