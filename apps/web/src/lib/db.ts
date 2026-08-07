import { loadEnv, type Env } from '@vacti/config';
import { createDb, type Database } from '@vacti/db';

let _env: Env | undefined;
let _db: Database | undefined;

export function env(): Env {
  return (_env ??= loadEnv());
}

/** Lazy singleton DB - created on first use so build/import never requires a live database. */
export function getDb(): Database {
  if (!_db) _db = createDb(env().DATABASE_URL).db;
  return _db;
}
