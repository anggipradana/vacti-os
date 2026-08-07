import { searchLeaks, searchLeaksComprehensive, type LeakSearchType } from './leakcheck';
import type { FetchLike } from './otx';

/**
 * Unified, WHITE-LABELED leak search: runs the enabled provider and merges its hits into one normalized
 * shape. The `provider` field is internal and must NEVER be shown to a non-admin - the UI shows only
 * `source` (the breach/database name). One search = one quota unit.
 */

export type LeakProvider = 'leakcheck';

export interface UnifiedLeakRecord {
  provider: LeakProvider; // INTERNAL - never render to a normal user
  source: string; // breach/database name (safe to show)
  infoLeak?: string;
  identifier?: string;
  password?: string;
  origin?: string;
  /**
   * The FULL set of columns for this row (all fields the provider returned), so nothing is lost. The UI
   * groups by `source` and renders each group's own columns from this map.
   */
  fields: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** A column looks like a password/hash (masked in the UI, encrypted at rest). */
export function isPasswordField(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('pass') || k === 'hash' || k.endsWith('password');
}

export interface UnifiedLeakResult {
  records: UnifiedLeakRecord[];
  /** Distinct breach/database sources. */
  sources: number;
  /** Non-fatal per-provider errors. */
  errors: string[];
  /** How many providers actually ran (had a key + were enabled). */
  providersRun: number;
}

export interface UnifiedLeakOpts {
  type?: LeakSearchType; // typed hint for the categorized provider
  limit?: number;
  leakcheckKey?: string | null; // pass null/undefined or enabled:false to skip that provider
  fetchImpl?: FetchLike;
}

const dedupeKey = (r: UnifiedLeakRecord) =>
  `${(r.identifier ?? '').toLowerCase()}|${r.password ?? ''}|${r.source.toLowerCase()}|${r.provider}`;

export async function searchUnifiedLeaks(query: string, opts: UnifiedLeakOpts = {}): Promise<UnifiedLeakResult> {
  const { type = 'auto', leakcheckKey, fetchImpl } = opts;
  const q = query.trim();
  if (!q) return { records: [], sources: 0, errors: [], providersRun: 0 };

  const tasks: Array<Promise<{ records: UnifiedLeakRecord[]; error?: string }>> = [];
  if (leakcheckKey) {
    // In auto mode, fan out across every relevant LeakCheck type (email+keyword, domain+keyword, ...) instead
    // of a single auto-detected interpretation. A specific type runs a single targeted query.
    const lc =
      type === 'auto'
        ? searchLeaksComprehensive(q, { key: leakcheckKey, fetchImpl })
        : searchLeaks(q, { key: leakcheckKey, type, fetchImpl });
    tasks.push(
      lc.then((r) => ({
        records: r.records.map((x) => {
          const fields: Record<string, string> = {};
          if (x.identifier) fields.Identifier = x.identifier;
          if (x.password) fields.Password = x.password;
          if (x.origin) fields.Origin = x.origin;
          return {
            provider: 'leakcheck' as const,
            source: x.source,
            identifier: x.identifier || undefined,
            password: x.password,
            origin: x.origin,
            fields,
          };
        }),
        error: r.error,
      })),
    );
  }

  const providersRun = tasks.length;
  const settled = await Promise.all(tasks);
  const errors = settled.map((s) => s.error).filter((e): e is string => !!e);
  const seen = new Set<string>();
  const records = settled
    .flatMap((s) => s.records)
    .filter((r) => (seen.has(dedupeKey(r)) ? false : (seen.add(dedupeKey(r)), true)));
  const sources = new Set(records.map((r) => r.source.toLowerCase())).size;
  return { records, sources, errors, providersRun };
}
