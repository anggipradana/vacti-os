/** Strict UUID check, used to reject malformed ids in internal routes before they hit Postgres
 * (a non-UUID value makes the pg driver throw `invalid input syntax for type uuid` -> a 500). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
