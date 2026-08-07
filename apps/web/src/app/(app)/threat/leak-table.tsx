'use client';

import * as React from 'react';
import { LEAK_STATUS_LABEL } from '@vacti/core';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Checkbox } from '../../../components/ui/checkbox';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Reveal } from '../../../components/ui/reveal';
import { LeakStatusBadge } from '../../../components/ui/finding-status';
import { AutoSubmitSelect } from '../../../components/ui/auto-submit-select';
import { setLeakStatusAction, deleteLeakAction, bulkSetLeakStatusByIdsAction } from '../../../lib/status-actions';
import { SortHeader, useTableSort } from '../../../components/ui/sortable';
import { tx, type Locale } from '../../../lib/i18n';

export interface LeakRow {
  id: string;
  identifier: string | null;
  password: string | null;
  origin: string | null;
  source: string | null;
  type: string;
  status: string;
}

const PAGE_SIZE = 25;
const STATUS_OPTIONS = Object.entries(LEAK_STATUS_LABEL);

/**
 * Leaked-credentials table with text search, status filter, and checkbox multi-select for bulk
 * status changes - plus per-row instant status change (AutoSubmitSelect) and delete. Passwords stay
 * masked behind the click-to-reveal `Reveal` cell exactly as before.
 */
export function LeakTable({
  leaks,
  canTriage,
  initialStatus = 'all',
  locale = 'en',
}: {
  leaks: LeakRow[];
  canTriage: boolean;
  /** Pre-applied status filter (deep links like the dashboard's "New leaked creds" tile). */
  initialStatus?: string;
  locale?: Locale;
}) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState(initialStatus);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leaks.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      return `${l.identifier ?? ''} ${l.source ?? ''} ${l.origin ?? ''}`.toLowerCase().includes(q);
    });
  }, [leaks, query, statusFilter]);

  // Column sort (default: identifier, A->Z). Sort AFTER the search/status filter, before paging.
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(
    filtered,
    {
      identifier: (l) => l.identifier,
      origin: (l) => l.origin,
      source: (l) => l.source,
      type: (l) => l.type,
      status: (l) => l.status,
    },
    'identifier',
    'asc',
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const shownIds = shown.map((l) => l.id);
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
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={tx(
            locale,
            'Search leaks (identifier, source, origin)…',
            'Cari leaks (identifier, source, origin)…',
          )}
          className="h-8 w-72 text-xs"
          aria-label="Search leaked credentials"
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 w-40 text-xs"
          aria-label="Filter leaks by status"
        >
          <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
          {STATUS_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-subtle">
          {filtered.length} {tx(locale, 'of', 'dari')} {leaks.length}
        </span>
      </div>

      {/* Bulk action bar - appears when rows are selected. */}
      {canTriage && selected.size > 0 ? (
        <ActionForm
          action={bulkSetLeakStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2"
        >
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selected.size} {tx(locale, 'selected', 'dipilih')}
          </span>
          <Select name="status" defaultValue="investigating" className="h-8 w-40 text-xs" aria-label="Bulk set status">
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
        <p className="text-sm text-fg-subtle">
          {tx(locale, 'No leaks match your search/filter.', 'Tidak ada leaks yang cocok dengan pencarian/filter Anda.')}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              {canTriage ? (
                <TH className="w-8">
                  <Checkbox checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all shown" />
                </TH>
              ) : null}
              <SortHeader
                label="Identifier"
                sortKey="identifier"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <TH>Password</TH>
              <SortHeader
                label="Origin"
                sortKey="origin"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="hidden md:table-cell"
              />
              <SortHeader
                label="Source"
                sortKey="source"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="hidden md:table-cell"
              />
              <SortHeader
                label={tx(locale, 'Type', 'Tipe')}
                sortKey="type"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="hidden sm:table-cell"
              />
              <SortHeader
                label={tx(locale, 'Triage status', 'Status triase')}
                sortKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="text-right"
              />
            </TR>
          </THead>
          <TBody>
            {shown.map((l) => (
              <TR key={l.id}>
                {canTriage ? (
                  <TD>
                    <Checkbox
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label={`Select ${l.identifier ?? l.id}`}
                    />
                  </TD>
                ) : null}
                <TD className="font-mono text-xs">{l.identifier}</TD>
                <TD>
                  <Reveal value={l.password} />
                </TD>
                <TD
                  className="hidden max-w-[200px] truncate font-mono text-xs text-fg-subtle md:table-cell"
                  title={l.origin ?? ''}
                >
                  {l.origin ?? '-'}
                </TD>
                <TD className="hidden md:table-cell">{l.source}</TD>
                <TD className="hidden sm:table-cell">
                  <Badge variant="neutral">{l.type}</Badge>
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1.5">
                    <LeakStatusBadge status={l.status} />
                    <ActionForm action={setLeakStatusAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={l.id} />
                      <AutoSubmitSelect
                        key={l.status}
                        name="status"
                        defaultValue={l.status}
                        className="h-8 w-40 text-xs"
                        aria-label="Change status"
                      >
                        {STATUS_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </ActionForm>
                    <ActionForm
                      action={deleteLeakAction}
                      confirm={tx(locale, 'Delete this leaked-credential row?', 'Hapus baris leaked-credential ini?')}
                    >
                      <input type="hidden" name="id" value={l.id} />
                      <ActionSubmit size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                        {tx(locale, 'Delete', 'Hapus')}
                      </ActionSubmit>
                    </ActionForm>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>
            {tx(locale, 'Page', 'Halaman')} {safePage} {tx(locale, 'of', 'dari')} {totalPages} · {filtered.length} leaks
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
