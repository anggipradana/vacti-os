'use client';

import * as React from 'react';
import { Eye, EyeOff, Download } from 'lucide-react';
import type { PublicLeakRecord } from '../../../lib/leak-types';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { SaveCaseDialog } from './save-case-dialog';

// Local copy (kept in sync with @vacti/threat-intel's isPasswordField): a client component must NOT import
// the threat-intel barrel at runtime - it pulls in server-only deps (pg) and breaks the browser bundle.
const isPasswordField = (key: string): boolean => {
  const k = key.toLowerCase();
  return k.startsWith('pass') || k === 'hash' || k.endsWith('password');
};

/** Rows shown per source group before a "Show more" control appears (keeps huge groups responsive). */
const GROUP_PAGE_SIZE = 50;

/** Columns that are meaningful to lead with when a database has them; everything else falls back to
 *  alphabetical. Compared case-insensitively. Password-like columns are always pushed to the end. */
const PRIORITY_COLUMNS = [
  'email',
  'identifier',
  'login',
  'username',
  'user',
  'name',
  'fullname',
  'full_name',
  'firstname',
  'lastname',
  'phone',
  'nik',
];

/** Human-friendly column header from a raw field key (snake/camel -> spaced words). */
function prettifyColumn(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Stable column order for a group: priority columns first, then the rest alphabetical, password-like last. */
function orderColumns(keys: string[]): string[] {
  const nonPw = keys.filter((k) => !isPasswordField(k));
  const pw = keys.filter((k) => isPasswordField(k)).sort((a, b) => a.localeCompare(b));
  const prio: string[] = [];
  for (const p of PRIORITY_COLUMNS) {
    const found = nonPw.find((k) => k.toLowerCase() === p);
    if (found && !prio.includes(found)) prio.push(found);
  }
  const others = nonPw.filter((k) => !prio.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...prio, ...others, ...pw];
}

/** Per-cell password: masked by default, revealed purely client-side (the values are already in props - no
 *  server call). Follows the shared reveal-all state, but a per-cell click can override it locally; whenever
 *  reveal-all is flipped the local override resets so every cell tracks the shared state again. */
function PasswordCell({ value, revealAll }: { value: string; revealAll: boolean }) {
  const [override, setOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    setOverride(null);
  }, [revealAll]);
  const shown = override ?? revealAll;
  return (
    <button
      type="button"
      onClick={() => setOverride(!shown)}
      title={shown ? 'Hide' : 'Reveal'}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-fg hover:text-accent"
    >
      {shown ? (
        <EyeOff className="size-3.5 shrink-0 text-fg-subtle" />
      ) : (
        <Eye className="size-3.5 shrink-0 text-fg-subtle" />
      )}
      <span className="break-all text-left">{shown ? value : '••••••'}</span>
    </button>
  );
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface SourceGroup {
  source: string;
  infoLeak?: string;
  rows: PublicLeakRecord[];
  columns: string[];
}

/** One source group as a titled block: header (name + row-count badge + optional infoLeak subtitle) over a
 *  table whose columns are the UNION of every row's `fields` keys in that group. Missing cells render blank.
 *  Password-like columns are masked with a per-cell eye toggle that respects the shared reveal-all state. */
function SourceSection({ group, revealAll }: { group: SourceGroup; revealAll: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? group.rows : group.rows.slice(0, GROUP_PAGE_SIZE);
  const hidden = group.rows.length - visible.length;

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-medium text-fg">{group.source || 'unknown'}</h3>
        <Badge variant="neutral">
          {group.rows.length} result{group.rows.length === 1 ? '' : 's'}
        </Badge>
        {group.infoLeak ? <span className="text-xs text-fg-subtle">{group.infoLeak}</span> : null}
      </div>

      <Table>
        <THead>
          <TR>
            {group.columns.map((col) => (
              <TH key={col}>{prettifyColumn(col)}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {visible.map((r, i) => (
            <TR key={i}>
              {group.columns.map((col) => {
                const value = r.fields[col];
                if (value == null || value === '') {
                  return (
                    <TD key={col} className="text-fg-subtle">
                      -
                    </TD>
                  );
                }
                if (isPasswordField(col)) {
                  return (
                    <TD key={col}>
                      <PasswordCell value={value} revealAll={revealAll} />
                    </TD>
                  );
                }
                return (
                  <TD key={col} className="whitespace-normal break-all font-mono text-xs">
                    {value}
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>

      {hidden > 0 ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(true)}>
          Show {hidden} more
        </Button>
      ) : expanded && group.rows.length > GROUP_PAGE_SIZE ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(false)}>
          Show less
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Ephemeral leak-search results, GROUPED by `source` (breach/database name). Each group renders every column
 * that database actually returned (the union of `fields` keys), so nothing is lost - rows vary per
 * database. The `provider` field on each record is INTENTIONALLY never rendered (white-label rule). Passwords
 * are masked with per-cell reveal plus one shared "Reveal all / Hide all" toggle.
 */
export function ResultsTable({
  records,
  query,
  sources,
}: {
  records: PublicLeakRecord[];
  query: string;
  sources: number;
}) {
  const [revealAll, setRevealAll] = React.useState(false);

  // Group by source, compute each group's column union, sort groups by descending row count.
  const groups = React.useMemo<SourceGroup[]>(() => {
    const bySource = new Map<string, PublicLeakRecord[]>();
    for (const r of records) {
      const key = r.source || 'unknown';
      const arr = bySource.get(key) ?? [];
      arr.push(r);
      bySource.set(key, arr);
    }
    const list: SourceGroup[] = [];
    for (const [source, rows] of bySource) {
      const colSet = new Set<string>();
      for (const row of rows) for (const k of Object.keys(row.fields)) colSet.add(k);
      list.push({
        source,
        infoLeak: rows.find((r) => r.infoLeak)?.infoLeak,
        rows,
        columns: orderColumns([...colSet]),
      });
    }
    list.sort((a, b) => b.rows.length - a.rows.length || a.source.localeCompare(b.source));
    return list;
  }, [records]);

  // CSV union: leading Source column + every `fields` key across ALL records (ordered like the groups).
  const exportCsv = () => {
    const colSet = new Set<string>();
    for (const r of records) for (const k of Object.keys(r.fields)) colSet.add(k);
    const columns = orderColumns([...colSet]);
    const header = ['Source', ...columns];
    const lines = [
      header.map((h) => csvEscape(h)).join(','),
      ...records.map((r) =>
        [r.source ?? '', ...columns.map((c) => r.fields[c] ?? '')].map((v) => csvEscape(String(v))).join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaks-${(query || 'export').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{records.length}</span> result{records.length === 1 ? '' : 's'} across{' '}
          <span className="font-medium text-fg">{sources}</span> source{sources === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRevealAll((v) => !v)}>
            {revealAll ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {revealAll ? 'Hide all' : 'Reveal all'}
          </Button>
          <SaveCaseDialog records={records} query={query} />
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <SourceSection key={group.source} group={group} revealAll={revealAll} />
        ))}
      </div>
    </div>
  );
}
