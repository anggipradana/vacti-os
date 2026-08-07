import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * A Card whose body collapses via native <details>/<summary> (no client JS). The summary shows the
 * title + a chevron that rotates when open; `actions` (e.g. buttons) render on the right and do NOT
 * toggle the section when clicked (they sit outside the <summary>, in the same header row).
 */
export function CollapsibleCard({
  title,
  defaultOpen = false,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn('group rounded-lg border border-border bg-surface shadow-sm', className)}>
      {/* The <summary> MUST be the direct first child of <details>, otherwise the browser ignores it and
          renders the generic default "Details" label instead of the title. Keep the header row INSIDE it. */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 items-center gap-2">
          <ChevronDown className="size-4 text-fg-subtle transition-transform group-open:rotate-180" />
          <span className="font-display text-base font-semibold leading-6">{title}</span>
        </span>
        {actions ? <span className="flex items-center gap-2">{actions}</span> : null}
      </summary>
      <div className="p-5 pt-0">{children}</div>
    </details>
  );
}
