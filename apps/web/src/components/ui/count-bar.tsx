/**
 * Right-aligned count with a proportional mini bar (relative to the column max), so "top N" tables
 * read at a glance instead of as bare numbers. Server-safe (pure markup).
 */
export function CountBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 && value > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-8 text-right">{value}</span>
    </div>
  );
}
