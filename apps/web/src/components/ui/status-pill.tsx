import { cn } from '../../lib/cn';
import { humanize } from '../../lib/format';

const map: Record<string, { dot: string; text: string; pulse?: boolean }> = {
  running: { dot: 'bg-accent', text: 'text-accent', pulse: true },
  queued: { dot: 'bg-risk-amber', text: 'text-risk-amber' },
  completed: { dot: 'bg-success', text: 'text-success' },
  failed: { dot: 'bg-danger', text: 'text-danger' },
  cancelled: { dot: 'bg-fg-subtle', text: 'text-fg-subtle' },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = map[status] ?? map.queued!;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium',
        s.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.dot, s.pulse && 'animate-pulse-dot')} />
      {humanize(status)}
    </span>
  );
}
