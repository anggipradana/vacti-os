import { eq } from 'drizzle-orm';
import { decryptSecret } from '@vacti/auth';
import { userCan, Permission, roleFromUser } from '@vacti/core';
import { leakSearches, leakSearchResults } from '@vacti/db';
import { getDb } from '../../../../../lib/db';
import { getCurrentUser } from '../../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV field escaping (RFC-4180): quote when the value holds a comma, quote, CR or LF; double inner quotes. */
function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export ONE saved leak Case as CSV. Owner-guarded (owner or SysAdmin) and RBAC-gated to operators
 * (InitiateScans; Auditor excluded). Passwords are decrypted here because the export is a deliberate,
 * audited operator action - the file is CONFIDENTIAL (leaked credentials) and marked as such. The
 * internal `provider` column is NEVER included.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!userCan(user, Permission.InitiateScans)) return new Response('Forbidden', { status: 403 });
  const { id } = await params;
  const db = getDb();

  const [c] = await db.select().from(leakSearches).where(eq(leakSearches.id, id));
  // Owner guard: must own the case, or be SysAdmin. 404 (do not leak existence) otherwise.
  if (!c || (c.userId !== user.id && roleFromUser(user) !== 'SysAdmin')) {
    return new Response('Not found', { status: 404 });
  }

  const rows = await db
    .select()
    .from(leakSearchResults)
    .where(eq(leakSearchResults.searchId, id))
    .orderBy(leakSearchResults.createdAt);

  const key = process.env.ENCRYPTION_KEY;

  // Column union across every row's `extra` (the full non-password column set); `provider` is never in
  // `extra` nor emitted. Header = Source + those columns + Password + Status. Decrypt each row's password
  // into the Password column; absent columns render as blank cells.
  const extraCols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.extra && typeof r.extra === 'object') {
      for (const k of Object.keys(r.extra as object)) {
        if (!seen.has(k)) {
          seen.add(k);
          extraCols.push(k);
        }
      }
    }
  }

  const lines: string[] = [
    '# CONFIDENTIAL - contains leaked credentials. Handle per your data-handling policy.',
    ['Source', ...extraCols, 'Password', 'Status'].map(esc).join(','),
  ];
  for (const r of rows) {
    let password = '';
    if (r.passwordCiphertext && key) {
      try {
        password = decryptSecret(r.passwordCiphertext, key);
      } catch {
        password = '';
      }
    }
    const extra = (r.extra && typeof r.extra === 'object' ? (r.extra as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    const cells = [r.source, ...extraCols.map((col) => extra[col] ?? ''), password, r.status];
    lines.push(cells.map(esc).join(','));
  }
  const csv = lines.join('\r\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leak-case-${id}.csv"`,
    },
  });
}
