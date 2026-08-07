'use client';

import * as React from 'react';
import { LEAK_STATUS_LABEL } from '@vacti/core';
import { tx, type Locale } from '../../../lib/i18n';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Checkbox } from '../../../components/ui/checkbox';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Select } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Reveal } from '../../../components/ui/reveal';
import { LeakStatusBadge } from '../../../components/ui/finding-status';
import { AutoSubmitSelect } from '../../../components/ui/auto-submit-select';
import { SortHeader, useTableSort } from '../../../components/ui/sortable';
import {
  setExposureStatusAction,
  setExposureNoteAction,
  bulkSetExposureStatusByIdsAction,
  deleteExposureAction,
} from '../../../lib/surface-actions';

/**
 * Serializable exposure-finding row. `snippet` stays CONFIDENTIAL - it is rendered ONLY through
 * <Reveal> (click-to-reveal mask), exactly as the server-rendered table did, and is never used as
 * search-filter input (we filter only over the plain-text fields already shown: type + url).
 */
export interface ExposureRow {
  id: string;
  findingType: string;
  snippet: string | null;
  urlText: string | null;
  status: string;
  analystNote: string | null;
}

const PAGE_SIZE = 25;
const STATUS_OPTIONS = Object.entries(LEAK_STATUS_LABEL);

/**
 * Exposure findings table with text search, type/status filters, and checkbox multi-select for
 * bulk status changes - plus per-row instant status change (AutoSubmitSelect) and delete.
 * Snippet masking and per-row RBAC (canTriage) controls are preserved exactly as before.
 */
export function ExposureTable({
  findings,
  canTriage,
  locale = 'en',
}: {
  findings: ExposureRow[];
  canTriage: boolean;
  locale?: Locale;
}) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);

  // Type options with per-type counts, e.g. "aws-key (3)" - the count keeps the option label distinct
  // from the in-row finding-type badge text.
  const types = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of findings) counts.set(f.findingType, (counts.get(f.findingType) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [findings]);

  const filtered = React.useMemo(() => {
    const qy = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (typeFilter !== 'all' && f.findingType !== typeFilter) return false;
      if (!qy) return true;
      // Search only over plain-text fields already shown - NOT the masked snippet (confidential PII).
      return `${f.findingType} ${f.urlText ?? ''}`.toLowerCase().includes(qy);
    });
  }, [findings, query, statusFilter, typeFilter]);

  // Column sort (default: type, A->Z). Sort AFTER the search/type/status filters, before paging.
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(
    filtered,
    {
      type: (f) => f.findingType,
      url: (f) => f.urlText,
      status: (f) => f.status,
    },
    'type',
    'asc',
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const shownIds = shown.map((f) => f.id);
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
          placeholder={tx(locale, 'Search findings (type, URL)…', 'Cari findings (type, URL)…')}
          className="h-8 w-72 text-xs"
          aria-label="Search exposure findings"
        />
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 w-40 text-xs"
          aria-label="Filter exposure findings by type"
        >
          <option value="all">{tx(locale, 'All types', 'Semua tipe')}</option>
          {types.map(([t, n]) => (
            <option key={t} value={t}>
              {t} ({n})
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 w-36 text-xs"
          aria-label="Filter exposure findings by status"
        >
          <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
          {STATUS_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-subtle">
          {filtered.length} {tx(locale, 'of', 'dari')} {findings.length}
        </span>
      </div>

      {/* Bulk action bar - appears when rows are selected. */}
      {canTriage && selected.size > 0 ? (
        <ActionForm
          action={bulkSetExposureStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2"
        >
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selected.size} {tx(locale, 'selected', 'dipilih')}
          </span>
          <Select name="status" defaultValue="investigating" className="h-8 w-36 text-xs" aria-label="Bulk set status">
            {STATUS_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {tx(locale, 'Set', 'Set')}: {label}
              </option>
            ))}
          </Select>
          <ActionSubmit size="sm" variant="primary">
            {tx(locale, 'Apply to selected', 'Terapkan ke yang dipilih')}
          </ActionSubmit>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {tx(locale, 'Clear', 'Hapus')}
          </Button>
        </ActionForm>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">
          {tx(
            locale,
            'No exposure findings match your search/filter.',
            'Tidak ada exposure findings yang cocok dengan pencarian/filter Anda.',
          )}
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
                label={tx(locale, 'Type', 'Tipe')}
                sortKey="type"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <TH>{tx(locale, 'Snippet', 'Snippet')}</TH>
              <SortHeader label="URL" sortKey="url" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader
                label={tx(locale, 'Status', 'Status')}
                sortKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
            </TR>
          </THead>
          <TBody>
            {shown.map((f) => (
              <TR key={f.id}>
                {canTriage ? (
                  <TD>
                    <Checkbox
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      aria-label={`Select ${f.findingType} finding`}
                    />
                  </TD>
                ) : null}
                <TD>
                  <Badge variant="danger">{f.findingType}</Badge>
                </TD>
                <TD>
                  <Reveal value={f.snippet} />
                </TD>
                <TD className="max-w-md font-mono text-xs text-fg-subtle">
                  <div className="truncate" title={f.urlText ?? ''}>
                    {f.urlText}
                  </div>
                  {f.analystNote ? (
                    <p className="mt-1 whitespace-normal rounded-md border border-border bg-surface-2 p-1.5 font-sans">
                      <strong>{tx(locale, 'Note', 'Catatan')}:</strong> {f.analystNote}
                    </p>
                  ) : null}
                </TD>
                <TD>
                  {canTriage ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <ActionForm action={setExposureStatusAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={f.id} />
                          <AutoSubmitSelect
                            key={f.status}
                            name="status"
                            defaultValue={f.status}
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
                        <ActionForm
                          action={deleteExposureAction}
                          confirm={tx(locale, 'Delete this exposure finding?', 'Hapus exposure finding ini?')}
                        >
                          <input type="hidden" name="id" value={f.id} />
                          <ActionSubmit size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                            {tx(locale, 'Delete', 'Hapus')}
                          </ActionSubmit>
                        </ActionForm>
                      </div>
                      <details className="text-xs text-fg-muted">
                        <summary className="cursor-pointer text-accent">
                          {f.analystNote
                            ? tx(locale, 'Edit note', 'Edit catatan')
                            : tx(locale, 'Add note', 'Tambah catatan')}
                        </summary>
                        <ActionForm action={setExposureNoteAction} className="mt-1 space-y-1">
                          <input type="hidden" name="id" value={f.id} />
                          <Textarea name="note" defaultValue={f.analystNote ?? ''} rows={2} className="text-xs" />
                          <ActionSubmit size="sm" variant="outline">
                            {tx(locale, 'Save note', 'Simpan catatan')}
                          </ActionSubmit>
                        </ActionForm>
                      </details>
                    </div>
                  ) : (
                    <LeakStatusBadge status={f.status} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>
            {tx(locale, 'Page', 'Halaman')} {safePage} {tx(locale, 'of', 'dari')} {totalPages} · {filtered.length}{' '}
            findings
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
