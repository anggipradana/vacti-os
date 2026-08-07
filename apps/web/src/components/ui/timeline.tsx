import { cn } from '../../lib/cn';
import { humanize } from '../../lib/format';

export function Timeline({ items }: { items: { stage: string; status: string; message?: string | null }[] }) {
  return (
    <ol className="relative ml-1.5 space-y-3 border-l border-border pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              'absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-bg',
              it.status === 'completed'
                ? 'bg-success'
                : it.status === 'running'
                  ? 'bg-accent'
                  : it.status === 'failed'
                    ? 'bg-danger'
                    : 'bg-fg-subtle',
            )}
          />
          <div className="text-sm">
            <span className="font-medium">{humanize(it.stage)}</span>
            <span className="text-fg-muted"> · {humanize(it.status)}</span>
            {it.message ? <span className="text-fg-subtle"> - {it.message}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
