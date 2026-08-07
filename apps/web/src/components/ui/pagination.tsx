import Link from 'next/link';
import { Button } from './button';

/**
 * Prev/next pager for long tables. `makeHref(page)` builds the URL for a target page so the caller
 * can preserve its other search params (project, filters, compare, …). Renders nothing for a single page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  label,
  makeHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  label: string;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-fg-subtle">
        Page {page} of {totalPages} · {total} {label}
      </span>
      <div className="flex gap-2">
        {/* A disabled link still navigates on Enter/middle-click, so render a plain disabled Button
            at the boundaries instead of an anchor. */}
        {atFirst ? (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={makeHref(page - 1)}>Previous</Link>
          </Button>
        )}
        {atLast ? (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={makeHref(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
