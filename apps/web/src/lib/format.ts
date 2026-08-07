/** Humanize a snake_case/kebab enum into Title Case ("in_progress" → "In Progress"). */
export function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a Date as "YYYY-MM-DD HH:MM" (UTC, stable across SSR/CSR). */
export function fmtDateTime(d: Date | string | number): string {
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}
