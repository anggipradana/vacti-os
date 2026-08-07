'use client';

import * as React from 'react';
import { NEWS_STATUS_LABEL } from '@vacti/core';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { NewsStatusBadge } from '../../../components/ui/finding-status';
import { AutoSubmitSelect } from '../../../components/ui/auto-submit-select';
import { setNewsStatusAction, bulkSetNewsStatusByIdsAction } from '../../../lib/threat-actions';
import { tx, type Locale } from '../../../lib/i18n';

export interface SectorNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  status: string;
}

const PAGE_SIZE = 25;
const STATUS_OPTIONS = Object.entries(NEWS_STATUS_LABEL);

/**
 * Sector security-news list with text search, status filter, and checkbox multi-select for bulk
 * status changes - plus per-row instant status change (AutoSubmitSelect).
 */
export function SectorNewsList({
  items,
  canTriage,
  initialStatus = 'all',
  locale = 'en',
}: {
  items: SectorNewsItem[];
  canTriage: boolean;
  /** Pre-applied status filter (deep links like the dashboard's "New sector news" tile). */
  initialStatus?: string;
  locale?: Locale;
}) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState(initialStatus);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (!q) return true;
      return `${n.title} ${n.source}`.toLowerCase().includes(q);
    });
  }, [items, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const shownIds = shown.map((n) => n.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const selectedIds = [...selected];

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canTriage ? (
          <Checkbox checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all shown" />
        ) : null}
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={tx(locale, 'Search news (title, source)…', 'Cari news (judul, source)…')}
          className="h-8 w-72 text-xs"
          aria-label="Search security news"
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 w-36 text-xs"
          aria-label="Filter news by status"
        >
          <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
          {STATUS_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-subtle">
          {filtered.length} {tx(locale, 'of', 'dari')} {items.length}
        </span>
      </div>

      {/* Bulk action bar - appears when rows are selected. */}
      {canTriage && selected.size > 0 ? (
        <ActionForm
          action={bulkSetNewsStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2"
        >
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selected.size} {tx(locale, 'selected', 'dipilih')}
          </span>
          <Select name="status" defaultValue="reviewed" className="h-8 w-36 text-xs" aria-label="Bulk set status">
            {STATUS_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {tx(locale, 'Set', 'Atur')}: {label}
              </option>
            ))}
          </Select>
          <ActionSubmit size="sm" variant="primary">
            {tx(locale, 'Apply to selected', 'Terapkan ke yang dipilih')}
          </ActionSubmit>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {tx(locale, 'Clear', 'Bersihkan')}
          </Button>
        </ActionForm>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">
          {tx(
            locale,
            'No headlines match your search/filter.',
            'Tidak ada headline yang cocok dengan pencarian/filter Anda.',
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                {canTriage ? (
                  <Checkbox
                    checked={selected.has(n.id)}
                    onChange={() => toggle(n.id)}
                    aria-label={`Select ${n.title}`}
                    className="mt-1"
                  />
                ) : null}
                <div className="min-w-0">
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {n.title}
                  </a>
                  <div className="mt-0.5 text-xs text-fg-subtle">
                    {n.source}
                    {n.publishedAt ? ` · ${new Date(n.publishedAt).toISOString().slice(0, 10)}` : ''}
                  </div>
                </div>
              </div>
              {canTriage ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <NewsStatusBadge status={n.status} />
                  <ActionForm action={setNewsStatusAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={n.id} />
                    <AutoSubmitSelect
                      key={n.status}
                      name="status"
                      defaultValue={n.status}
                      className="h-8 w-36 text-xs"
                      aria-label="Change status"
                    >
                      {STATUS_OPTIONS.map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </ActionForm>
                </div>
              ) : (
                <Badge variant="neutral" className="shrink-0">
                  {NEWS_STATUS_LABEL[n.status as keyof typeof NEWS_STATUS_LABEL] ?? n.status}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>
            {tx(locale, 'Page', 'Halaman')} {safePage} {tx(locale, 'of', 'dari')} {totalPages} · {filtered.length}{' '}
            {tx(locale, 'headlines', 'headline')}
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              {tx(locale, 'Prev', 'Sebelumnya')}
            </Button>
            <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              {tx(locale, 'Next', 'Berikutnya')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
