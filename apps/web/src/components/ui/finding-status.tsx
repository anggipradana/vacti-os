import {
  VULN_STATUS_LABEL,
  VULN_ACTIVE_STATUSES,
  NEWS_STATUS_LABEL,
  LEAK_STATUS_LABEL,
  type VulnStatusValue,
} from '@vacti/core';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

const RESOLVED = new Set(['resolved']);
const active = new Set<string>(VULN_ACTIVE_STATUSES);

const MUTED = 'border-border bg-surface-2 text-fg-muted';
const GOOD = 'border-success/30 bg-success/10 text-success';
const WARN = 'border-high/30 bg-high/10 text-high';
const INFO = 'border-accent/30 bg-accent/10 text-accent';

function StatusPill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', tone)}>
      {children}
    </span>
  );
}

export function VulnStatusBadge({ status }: { status: string }) {
  const tone = active.has(status) ? WARN : RESOLVED.has(status) ? GOOD : MUTED;
  return <StatusPill tone={tone}>{VULN_STATUS_LABEL[status as VulnStatusValue] ?? status}</StatusPill>;
}

// News / brand triage statuses: new (untriaged) → reviewed/actioned (done) → relevant (flagged) → dismissed.
const NEWS_TONE: Record<string, string> = {
  new: INFO,
  reviewed: GOOD,
  actioned: GOOD,
  relevant: WARN,
  dismissed: MUTED,
};
export function NewsStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={NEWS_TONE[status] ?? MUTED}>
      {NEWS_STATUS_LABEL[status as keyof typeof NEWS_STATUS_LABEL] ?? status}
    </StatusPill>
  );
}

// Leak triage statuses: new/confirmed (attention) → investigating (in progress) → remediated (done) → fp/ignored (muted).
const LEAK_TONE: Record<string, string> = {
  new: WARN,
  confirmed: WARN,
  investigating: INFO,
  remediated: GOOD,
  false_positive: MUTED,
  ignored: MUTED,
};
export function LeakStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={LEAK_TONE[status] ?? MUTED}>
      {LEAK_STATUS_LABEL[status as keyof typeof LEAK_STATUS_LABEL] ?? status}
    </StatusPill>
  );
}
