/** Pure scan-comparison helpers (no DB) - compare two scans' result key-sets. */

export interface ScanResultKeys {
  subdomains: string[];
  endpoints: string[];
  ports: string[];
  vulns: string[];
}

export interface DiffEntry {
  added: string[];
  removed: string[];
  unchanged: number;
}

export interface ScanDiff {
  subdomains: DiffEntry;
  endpoints: DiffEntry;
  ports: DiffEntry;
  vulns: DiffEntry;
}

function diffList(baseline: string[], current: string[]): DiffEntry {
  const base = new Set(baseline);
  const cur = new Set(current);
  // Iterate the sets (not the raw arrays) so duplicate input rows cannot inflate the diff.
  return {
    added: [...cur].filter((x) => !base.has(x)),
    removed: [...base].filter((x) => !cur.has(x)),
    unchanged: [...cur].filter((x) => base.has(x)).length,
  };
}

/** Diff `current` against `baseline` (older). `added` = new in current; `removed` = gone since baseline. */
export function diffScans(baseline: ScanResultKeys, current: ScanResultKeys): ScanDiff {
  return {
    subdomains: diffList(baseline.subdomains, current.subdomains),
    endpoints: diffList(baseline.endpoints, current.endpoints),
    ports: diffList(baseline.ports, current.ports),
    vulns: diffList(baseline.vulns, current.vulns),
  };
}
