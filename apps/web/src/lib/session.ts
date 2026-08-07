import 'server-only';
import { cache } from 'react';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@vacti/db';
import { getDb } from './db';

const COOKIE = 'vacti_session';
// Idle timeout (session dies after 60 min of inactivity) + hard absolute cap (12 h regardless of use).
const IDLE_MS = 60 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<void> {
  const id = randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = new Date(now + ABSOLUTE_MS);
  await getDb()
    .insert(sessions)
    .values({ id, userId, expiresAt, lastSeenAt: new Date(now) });
  const jar = await cookies();
  // No `expires`: a session cookie whose real lifetime the SERVER decides (idle + absolute checks in
  // getCurrentUser). sameSite 'strict' - this is an internal console with no cross-site inbound flows.
  // secure is fail-safe: ON everywhere except the test runner.
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV !== 'test',
    path: '/',
  });
}

// Per-request memoised: the shared layout + the page both call this on every navigation; cache()
// collapses those into a single DB round-trip per render (lighter, faster nav).
export const getCurrentUser = cache(async () => {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!session) return null;
  const now = new Date();
  // Absolute expiry OR idle expiry - reap the row on the way out either way.
  if (session.expiresAt < now || now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Sliding refresh, throttled to ~once/min so a busy session doesn't write on every request.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    void db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, id))
      .catch(() => {});
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  return user ?? null;
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await getDb().delete(sessions).where(eq(sessions.id, id));
  jar.delete(COOKIE);
}

/** Revoke every session for a user (sign out of all devices) and clear the current cookie. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
  (await cookies()).delete(COOKIE);
}

export async function userCount(): Promise<number> {
  const rows = await getDb().select().from(users);
  return rows.length;
}
