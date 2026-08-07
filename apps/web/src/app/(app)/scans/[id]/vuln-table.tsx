'use client';

import * as React from 'react';
import { VULN_STATUS_LABEL, type SeverityValue } from '@vacti/core';
import { tx, type Locale } from '../../../../lib/i18n';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Button } from '../../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../../components/ui/action-form';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Select } from '../../../../components/ui/select';
import { SeverityBadge } from '../../../../components/ui/severity-badge';
import { VulnStatusBadge } from '../../../../components/ui/finding-status';
import { SortHeader, useTableSort } from '../../../../components/ui/sortable';
import { AutoSubmitSelect } from '../../../../components/ui/auto-submit-select';
// (Badge intentionally not imported - read-only status uses VulnStatusBadge.)
import {
  setVulnStatusAction,
  setVulnNoteAction,
  bulkSetVulnStatusByIdsAction,
  deleteVulnAction,
} from '../../../../lib/status-actions';

export interface VulnRow {
  id: string;
  name: string;
  matchedAt: string | null;
  severity: number;
  status: string;
  description: string | null;
  remediation: string | null;
  cvss: number | null;
  cveIds: string[];
  references: string[];
  isAiEnriched: boolean;
  aiDescription: string | null;
  aiImpact: string | null;
  aiRemediation: string | null;
  request: string | null;
  response: string | null;
  analystNote: string | null;
}

const PAGE_SIZE = 50;
const STATUS_OPTIONS = Object.entries(VULN_STATUS_LABEL);

/**
 * Findings table with a text search, status filter, and checkbox multi-select for bulk status
 * changes - plus per-row instant status change (AutoSubmitSelect), AI enrich and delete.
 */
export function VulnTable({
  vulns,
  scanId,
  canTriage,
  locale = 'en',
}: {
  vulns: VulnRow[];
  scanId: string;
  canTriage: boolean;
  locale?: Locale;
}) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);

  // AI enrichment runs via a plain fetch (reliable on this heavy page, unlike a server action whose
  // response gets dropped) and shows the result inline - a spinner on the button, no page reload.
  type Enrichment = { description: string; impact: string; remediation: string };
  const [enriched, setEnriched] = React.useState<Record<string, Enrichment>>({});
  const [enrichMsg, setEnrichMsg] = React.useState<Record<string, string>>({});
  const [bulkEnrich, setBulkEnrich] = React.useState<{ done: number; total: number } | null>(null);
  const enrichOne = async (id: string): Promise<boolean> => {
    setEnrichMsg((m) => ({ ...m, [id]: '' }));
    try {
      const res = await fetch('/api/internal/enrich-vuln', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok?: boolean; enrichment?: Enrichment; error?: string };
      if (data.ok && data.enrichment) {
        setEnriched((e) => ({ ...e, [id]: data.enrichment! }));
        return true;
      }
      setEnrichMsg((m) => ({
        ...m,
        [id]:
          data.error === 'no_ai_provider'
            ? tx(locale, 'Set an AI provider + key first', 'Atur AI provider + key terlebih dahulu')
            : tx(locale, 'AI failed, try again', 'AI gagal, coba lagi'),
      }));
      return false;
    } catch {
      setEnrichMsg((m) => ({ ...m, [id]: tx(locale, 'Request failed', 'Permintaan gagal') }));
      return false;
    }
  };
  // Bulk AI enrich the selected findings (sequential to be gentle on the provider).
  const runEnrichBulk = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkEnrich({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      await enrichOne(ids[i]!);
      setBulkEnrich({ done: i + 1, total: ids.length });
    }
    setBulkEnrich(null);
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return vulns.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return `${v.name} ${v.matchedAt ?? ''} ${v.cveIds.join(' ')}`.toLowerCase().includes(q);
    });
  }, [vulns, query, statusFilter]);

  // Column sort (default: severity, highest first). Sort AFTER the search/status filter, before paging.
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(
    filtered,
    {
      severity: (v) => v.severity,
      name: (v) => v.name,
      status: (v) => v.status,
      location: (v) => v.matchedAt,
    },
    'severity',
    'desc',
  );

  // Keep the page in range as the filter narrows.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const shownIds = shown.map((v) => v.id);
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
          placeholder={tx(locale, 'Search findings (name, location, CVE)…', 'Cari temuan (nama, lokasi, CVE)…')}
          className="h-8 w-72 text-xs"
          aria-label={tx(locale, 'Search findings', 'Cari temuan')}
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 w-40 text-xs"
          aria-label={tx(locale, 'Filter findings by status', 'Filter temuan berdasarkan status')}
        >
          <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
          {STATUS_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-subtle">
          {filtered.length} {tx(locale, 'of', 'dari')} {vulns.length}
        </span>
      </div>

      {/* Bulk action bar - appears when rows are selected. */}
      {canTriage && selected.size > 0 ? (
        <ActionForm
          action={bulkSetVulnStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2"
        >
          <input type="hidden" name="scanId" value={scanId} />
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selected.size} {tx(locale, 'selected', 'dipilih')}
          </span>
          <Select
            name="status"
            defaultValue="in_progress"
            className="h-8 w-40 text-xs"
            aria-label={tx(locale, 'Bulk set status', 'Atur status massal')}
          >
            {STATUS_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {tx(locale, 'Set', 'Atur')}: {label}
              </option>
            ))}
          </Select>
          <ActionSubmit size="sm" variant="primary">
            {tx(locale, 'Apply to selected', 'Terapkan ke yang dipilih')}
          </ActionSubmit>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={Boolean(bulkEnrich)}
            onClick={runEnrichBulk}
            title={tx(
              locale,
              'Generate AI description/impact/remediation for the selected findings (also used in the report)',
              'Buat AI description/impact/remediation untuk temuan terpilih (juga dipakai di laporan)',
            )}
          >
            {bulkEnrich
              ? `${tx(locale, 'AI enriching', 'AI memperkaya')} ${bulkEnrich.done}/${bulkEnrich.total}`
              : tx(locale, 'AI enrich', 'AI enrich')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {tx(locale, 'Clear', 'Bersihkan')}
          </Button>
        </ActionForm>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          {tx(
            locale,
            'No findings match your search/filter.',
            'Tidak ada temuan yang cocok dengan pencarian/filter Anda.',
          )}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              {canTriage ? (
                <TH className="w-8">
                  <Checkbox
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    aria-label={tx(locale, 'Select all shown', 'Pilih semua yang ditampilkan')}
                  />
                </TH>
              ) : null}
              <SortHeader label="Severity" sortKey="severity" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader
                label={tx(locale, 'Finding', 'Temuan')}
                sortKey="name"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label={tx(locale, 'Status', 'Status')}
                sortKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              {canTriage ? <TH>{tx(locale, 'Actions', 'Aksi')}</TH> : null}
            </TR>
          </THead>
          <TBody>
            {shown.map((v) => (
              <TR key={v.id}>
                {canTriage ? (
                  <TD>
                    <Checkbox
                      checked={selected.has(v.id)}
                      onChange={() => toggle(v.id)}
                      aria-label={`${tx(locale, 'Select', 'Pilih')} ${v.name}`}
                    />
                  </TD>
                ) : null}
                <TD>
                  <SeverityBadge severity={v.severity as SeverityValue} />
                </TD>
                <TD>
                  <div className="font-medium">{v.name}</div>
                  <div className="max-w-md truncate font-mono text-xs text-fg-subtle" title={v.matchedAt ?? ''}>
                    {v.matchedAt}
                  </div>
                  {v.description ||
                  v.remediation ||
                  v.cvss != null ||
                  (v.cveIds?.length ?? 0) > 0 ||
                  (v.references?.length ?? 0) > 0 ? (
                    <details className="mt-1 max-w-md text-xs text-fg-muted">
                      <summary className="cursor-pointer text-accent">
                        {tx(locale, 'Details (template)', 'Detail (template)')}
                      </summary>
                      {v.description ? (
                        <p className="mt-1">
                          <strong>{tx(locale, 'Description', 'Deskripsi')}:</strong> {v.description}
                        </p>
                      ) : null}
                      {v.remediation ? (
                        <p className="mt-1">
                          <strong>{tx(locale, 'Remediation', 'Remediasi')}:</strong> {v.remediation}
                        </p>
                      ) : null}
                      {v.cvss != null || (v.cveIds?.length ?? 0) > 0 ? (
                        <p className="mt-1">
                          {v.cvss != null ? <strong>CVSS {v.cvss}</strong> : null}
                          {v.cvss != null && (v.cveIds?.length ?? 0) > 0 ? ' · ' : null}
                          {v.cveIds?.join(', ')}
                        </p>
                      ) : null}
                      {v.references?.length ? (
                        <div className="mt-1">
                          <strong>{tx(locale, 'References', 'Referensi')}:</strong>
                          <ul className="ml-4 list-disc">
                            {v.references.slice(0, 8).map((r) => (
                              <li key={r} className="break-all">
                                <a
                                  href={r}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline"
                                >
                                  {r}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </details>
                  ) : null}
                  {enrichMsg[v.id] ? <p className="mt-1 max-w-md text-xs text-danger">{enrichMsg[v.id]}</p> : null}
                  {(() => {
                    const ai =
                      enriched[v.id] ??
                      (v.isAiEnriched
                        ? { description: v.aiDescription, impact: v.aiImpact, remediation: v.aiRemediation }
                        : null);
                    if (!ai) return null;
                    return (
                      <details className="mt-1 max-w-md text-xs text-fg-muted" open={Boolean(enriched[v.id])}>
                        <summary className="cursor-pointer text-accent">
                          {tx(locale, 'AI analysis', 'Analisis AI')}
                        </summary>
                        {ai.description ? (
                          <p className="mt-1">
                            <strong>{tx(locale, 'Description', 'Deskripsi')}:</strong> {ai.description}
                          </p>
                        ) : null}
                        {ai.impact ? (
                          <p className="mt-1">
                            <strong>Impact:</strong> {ai.impact}
                          </p>
                        ) : null}
                        {ai.remediation ? (
                          <p className="mt-1">
                            <strong>{tx(locale, 'Remediation', 'Remediasi')}:</strong> {ai.remediation}
                          </p>
                        ) : null}
                      </details>
                    );
                  })()}
                  {v.request || v.response ? (
                    <details className="mt-1 max-w-md text-xs text-fg-muted">
                      <summary className="cursor-pointer text-accent">Request / Response</summary>
                      {v.request ? (
                        <div className="mt-1">
                          <div className="font-semibold text-fg-subtle">Request</div>
                          <pre className="mt-0.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-snug">
                            {v.request}
                          </pre>
                        </div>
                      ) : null}
                      {v.response ? (
                        <div className="mt-1">
                          <div className="font-semibold text-fg-subtle">Response</div>
                          <pre className="mt-0.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-snug">
                            {v.response}
                          </pre>
                        </div>
                      ) : null}
                    </details>
                  ) : null}
                  {/* Analyst note - visible to all; editable by triagers. */}
                  {v.analystNote ? (
                    <p className="mt-1 max-w-md rounded-md border border-border bg-surface-2 p-1.5 text-xs">
                      <strong>{tx(locale, 'Note', 'Catatan')}:</strong> {v.analystNote}
                    </p>
                  ) : null}
                  {canTriage ? (
                    <details className="mt-1 max-w-md text-xs text-fg-muted">
                      <summary className="cursor-pointer text-accent">
                        {v.analystNote
                          ? tx(locale, 'Edit note', 'Ubah catatan')
                          : tx(locale, 'Add note', 'Tambah catatan')}
                      </summary>
                      <ActionForm action={setVulnNoteAction} className="mt-1 space-y-1">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="scanId" value={scanId} />
                        <Textarea
                          name="note"
                          defaultValue={v.analystNote ?? ''}
                          rows={2}
                          placeholder={tx(
                            locale,
                            'Investigation context, false-positive reason, …',
                            'Konteks investigasi, alasan false-positive, …',
                          )}
                          className="text-xs"
                        />
                        <ActionSubmit size="sm" variant="outline">
                          {tx(locale, 'Save note', 'Simpan catatan')}
                        </ActionSubmit>
                      </ActionForm>
                    </details>
                  ) : null}
                </TD>
                <TD>
                  {canTriage ? (
                    <ActionForm action={setVulnStatusAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="scanId" value={scanId} />
                      <AutoSubmitSelect
                        key={v.status}
                        name="status"
                        defaultValue={v.status}
                        className="h-8 w-36 text-xs"
                        aria-label={tx(locale, 'Change status', 'Ubah status')}
                      >
                        {STATUS_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </ActionForm>
                  ) : (
                    <VulnStatusBadge status={v.status} />
                  )}
                </TD>
                {canTriage ? (
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <ActionForm
                        action={deleteVulnAction}
                        confirm={tx(locale, 'Delete this finding?', 'Hapus temuan ini?')}
                      >
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="scanId" value={scanId} />
                        <ActionSubmit size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                          {tx(locale, 'Delete', 'Hapus')}
                        </ActionSubmit>
                      </ActionForm>
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>
            {tx(locale, 'Page', 'Halaman')} {safePage} {tx(locale, 'of', 'dari')} {totalPages} · {filtered.length}{' '}
            {tx(locale, 'findings', 'temuan')}
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
