'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, FolderSearch } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { EmptyState } from '../../../components/ui/empty-state';
import type { CaseCard } from './leaks-tabs';

/** Compact relative time ("3d ago"), stable enough for a list card. */
function relative(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 2592000) return `${Math.floor(secs / 86400)}d ago`;
  if (secs < 31536000) return `${Math.floor(secs / 2592000)}mo ago`;
  return `${Math.floor(secs / 31536000)}y ago`;
}

/**
 * Cases tab: the caller's saved leak-search snapshots as cards, each linking to its detail page
 * (/leaks/[id], built separately). A pure client-side filter narrows the list by name/query/tag.
 */
export function CasesList({ cases }: { cases: CaseCard[] }) {
  const [filter, setFilter] = React.useState('');

  const shown = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => [c.name, c.query, ...c.tags].some((v) => v.toLowerCase().includes(q)));
  }, [cases, filter]);

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={<FolderSearch />}
        title="No saved cases yet"
        description="Run a search and Save as Case to keep a snapshot here for triage."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter cases..."
          className="pl-8"
          aria-label="Filter cases"
        />
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">No cases match your filter.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <Link key={c.id} href={`/leaks/${c.id}`} className="group block">
              <Card className="h-full transition-colors group-hover:border-accent/50">
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-fg group-hover:text-accent">{c.name}</p>
                    <span className="shrink-0 text-xs text-fg-subtle">{relative(c.updatedAt)}</span>
                  </div>
                  <p className="truncate font-mono text-xs text-fg-subtle" title={c.query}>
                    {c.query}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {c.resultCount} hit{c.resultCount === 1 ? '' : 's'} · {c.sourceCount} source
                    {c.sourceCount === 1 ? '' : 's'}
                  </p>
                  {c.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
