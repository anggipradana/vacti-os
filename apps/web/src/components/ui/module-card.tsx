import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Wazuh-style overview module tile: coloured icon, title, blurb, optional status. */
export function ModuleCard({
  icon,
  title,
  description,
  href,
  hue,
  status,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  hue: string; // e.g. "204 90% 50%"
  status?: 'live' | 'soon';
}) {
  const inner = (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-lg border border-border bg-surface p-5 shadow-sm transition-all',
        href ? 'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md' : 'opacity-80',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: `hsl(${hue})` }} />
      <div className="flex items-start justify-between">
        <span
          className="flex size-10 items-center justify-center rounded-lg [&_svg]:size-5"
          style={{ background: `hsl(${hue} / 0.14)`, color: `hsl(${hue})` }}
        >
          {icon}
        </span>
        {status === 'soon' ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
            soon
          </span>
        ) : href ? (
          <ArrowUpRight className="size-4 text-fg-subtle transition-colors group-hover:text-fg" />
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
