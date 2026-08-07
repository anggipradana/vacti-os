'use client';

import * as React from 'react';
import { cn } from '../../lib/cn';
import { TH } from './table';

export type SortDir = 'asc' | 'desc';

/** A value accessor per sort key: returns the comparable value (number/string) or null for "missing". */
export type SortAccessors<T> = Record<string, (row: T) => number | string | null | undefined>;

/**
 * Client-side table sorting. Given rows + a map of key -> accessor, returns the sorted rows plus the active
 * key/dir and a toggle. Nulls always sort last regardless of direction. Clicking the active key flips the
 * direction; clicking a new key selects it (starting descending - highest/newest first, the useful default).
 */
export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initialKey: string,
  initialDir: SortDir = 'desc',
): { sorted: T[]; sortKey: string; sortDir: SortDir; toggleSort: (key: string) => void } {
  const [sortKey, setSortKey] = React.useState(initialKey);
  const [sortDir, setSortDir] = React.useState<SortDir>(initialDir);

  const sorted = React.useMemo(() => {
    const acc = accessors[sortKey];
    if (!acc) return rows;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na && nb) return 0;
      if (na) return 1; // nulls last, both directions
      if (nb) return -1;
      const r =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
      return r * factor;
    });
  }, [rows, sortKey, sortDir, accessors]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}

/** A sortable column header: a TH whose label is a button that toggles sort on `sortKey`, with an arrow. */
export function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: React.ReactNode;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 font-medium transition-colors hover:text-fg',
          active ? 'text-fg' : 'text-fg-subtle',
        )}
        aria-label={`Sort by ${typeof label === 'string' ? label : sortKey}`}
      >
        {label}
        <span className="text-[10px] leading-none opacity-70">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </TH>
  );
}
