/**
 * Minimal standard 5-field cron matcher (no dependency) for lightweight scheduled scans.
 * Fields: minute hour day-of-month month day-of-week. Supports `*`, lists `a,b`, ranges `a-b`,
 * and steps `* /n` / `a-b/n`. Evaluated against local server time.
 */

const RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (Sun=0)
];

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const slash = part.split('/');
    const rangePart = slash[0] ?? '';
    const stepPart = slash[1];
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === '') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      lo = a!;
      hi = b!;
    } else {
      const n = Number(rangePart);
      if (!Number.isInteger(n)) return null;
      lo = n;
      hi = stepPart === undefined ? n : max;
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron into per-field allowed-value sets, or null if invalid. */
export function parseCron(expr: string): Set<number>[] | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const s = parseField(fields[i]!, RANGES[i]![0], RANGES[i]![1]);
    if (!s) return null;
    sets.push(s);
  }
  return sets;
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) !== null;
}

/** Does `date` (local time) satisfy the cron expression? */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  const sets = parseCron(expr);
  if (!sets || fields.length !== 5) return false;
  // Standard cron rule: when BOTH day-of-month and day-of-week are restricted (not '*'), the day
  // matches when EITHER does (OR), not both. With only one restricted, that one decides.
  const domRestricted = fields[2] !== '*';
  const dowRestricted = fields[4] !== '*';
  const domMatch = sets[2]!.has(date.getDate());
  const dowMatch = sets[4]!.has(date.getDay());
  const dayMatch = domRestricted && dowRestricted ? domMatch || dowMatch : domMatch && dowMatch;
  return (
    sets[0]!.has(date.getMinutes()) && sets[1]!.has(date.getHours()) && sets[3]!.has(date.getMonth() + 1) && dayMatch
  );
}

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Build a 5-field cron from a friendly schedule (frequency + time of day, plus day-of-week for
 * weekly or day-of-month for monthly). Lets the UI offer pickers instead of raw cron syntax.
 */
export function buildCron(opts: {
  freq: ScheduleFrequency;
  hour?: number;
  minute?: number;
  dow?: number; // 0=Sunday .. 6=Saturday (weekly)
  dom?: number; // 1..28 (monthly)
}): string {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n) || 0));
  const m = clamp(opts.minute ?? 0, 0, 59);
  const h = clamp(opts.hour ?? 2, 0, 23);
  switch (opts.freq) {
    case 'hourly':
      return `${m} * * * *`;
    case 'weekly':
      return `${m} ${h} * * ${clamp(opts.dow ?? 1, 0, 6)}`;
    case 'monthly':
      return `${m} ${h} ${clamp(opts.dom ?? 1, 1, 28)} * *`;
    case 'daily':
    default:
      return `${m} ${h} * * *`;
  }
}
