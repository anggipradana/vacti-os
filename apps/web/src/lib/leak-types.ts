/**
 * Client-facing leak record shape. This is DELIBERATELY the white-labeled projection of the server-side
 * UnifiedLeakRecord: it OMITS the internal `provider` field (and the raw `extra`), so which upstream source
 * produced a row never travels to the browser - not in the rendered UI and not in the network/JSON payload
 * (checked via DevTools/Burp). The search action strips those fields before returning results here.
 *
 * Plain types only (no server imports) so client components can import it without pulling server-only deps.
 */
export interface PublicLeakRecord {
  source: string; // breach/database name (safe to show)
  infoLeak?: string;
  identifier?: string;
  password?: string;
  origin?: string;
  fields: Record<string, string>; // every column the row has (password-like ones masked in the UI)
}
