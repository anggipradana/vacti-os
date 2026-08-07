import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Create a Drizzle client backed by a pg Pool. Caller owns the pool lifecycle via `close`. */
export function createDb(connectionString: string): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
