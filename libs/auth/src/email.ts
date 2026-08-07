/**
 * Canonical email form. EVERY read and write path must funnel through this: rows are stored
 * normalized (create-admin, add-user, change-email), so a login lookup that skips normalization
 * never matches a row typed with different casing or a stray space. One helper keeps the login
 * lookup and the stored value in lockstep by construction.
 */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}
