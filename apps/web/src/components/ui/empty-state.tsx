import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      {icon ? <div className="rounded-full bg-surface-2 p-3 text-fg-subtle [&_svg]:size-6">{icon}</div> : null}
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
