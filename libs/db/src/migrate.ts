import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Apply all pending Drizzle migrations. `migrationsFolder` defaults to `<cwd>/drizzle`. */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string = resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
