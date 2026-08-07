import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Database } from './client';
import { runMigrations } from './migrate';
import { users, projects } from './schema';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('@vacti/db integration', () => {
  let handle: { db: Database; close: () => Promise<void> };

  beforeAll(async () => {
    await runMigrations(url!);
    handle = createDb(url!);
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('inserts and queries a user', async () => {
    const email = `user_${Date.now()}@example.com`;
    await handle.db.insert(users).values({ email, passwordHash: 'hash' });
    const rows = await handle.db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe(email);
    expect(rows[0]!.isSysAdmin).toBe(false);
  });

  it('enforces unique project slug', async () => {
    const slug = `proj-${Date.now()}`;
    await handle.db.insert(projects).values({ slug, name: 'P' });
    await expect(handle.db.insert(projects).values({ slug, name: 'Dup' })).rejects.toThrow();
  });
});
