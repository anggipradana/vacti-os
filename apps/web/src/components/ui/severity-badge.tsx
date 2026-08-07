import { SEVERITY_LABEL, type SeverityValue } from '@vacti/core';
import { cn } from '../../lib/cn';

const styles: Record<number, string> = {
  4: 'text-critical bg-critical/10 border-critical/30',
  3: 'text-high bg-high/10 border-high/30',
  2: 'text-medium bg-medium/10 border-medium/30',
  1: 'text-low bg-low/10 border-low/30',
  0: 'text-info bg-info/10 border-info/30',
  [-1]: 'text-fg-muted bg-surface-2 border-border',
};

export function SeverityBadge({ severity, className }: { severity: SeverityValue; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        styles[severity] ?? styles[-1],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {SEVERITY_LABEL[severity] ?? 'Unknown'}
    </span>
  );
}
