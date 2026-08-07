/**
 * Dashboard section primitives. The Overview page is organised into labelled per-module sections
 * (Vulnerability Assessment, Attack Surface, Cyber Threat Intel, Leaks); these give each section
 * a consistent header (title + optional action + subtle divider) and a simple progress bar. Server-safe
 * (pure markup, no client hooks).
 */
import type { ReactNode } from 'react';

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-10 border-b border-border pb-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-wide text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/** Horizontal progress bar (0-100%) with an optional label, used for remediation progress. */
export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
      </div>
      {label ? <div className="mt-1.5 text-xs text-fg-muted">{label}</div> : null}
    </div>
  );
}
