import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { CheckCircle2, XCircle } from 'lucide-react';
import { scans, targets } from '@vacti/db';
import { PageHeader } from '../../../components/ui/page-header';
import { Badge } from '../../../components/ui/badge';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import { tenantScope, scopeWhere } from '../../../lib/tenancy';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';
import { fmtDateTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';

/** In-app notifications center: recent scan activity (completed/failed, last 48h). No dedicated table
 *  yet - derived from scan state, which is what actually needs the operator's eyes. */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const db = getDb();
  const t = await tenantScope(user);

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recent = await db
    .select({
      id: scans.id,
      status: scans.status,
      finishedAt: scans.finishedAt,
      error: scans.error,
      domain: targets.domain,
    })
    .from(scans)
    .innerJoin(targets, eq(targets.id, scans.targetId))
    .where(
      and(
        inArray(scans.status, ['completed', 'failed', 'cancelled']),
        gt(scans.finishedAt, since),
        scopeWhere(t, scans.projectId),
      ),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(30);

  return (
    <div>
      <PageHeader title={tx(locale, 'Notifications', 'Notifikasi')} />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">{tx(locale, 'Recent activity (48h)', 'Aktivitas terbaru (48j)')}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            {tx(locale, 'No recent scan activity.', 'Belum ada aktivitas scan terbaru.')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((s) => {
              const ok = s.status === 'completed';
              return (
                <Link
                  key={s.id}
                  href={`/scans/${s.id}`}
                  className="flex flex-col gap-1 rounded border border-border px-3 py-2 text-sm hover:bg-bg-subtle"
                >
                  <div className="flex items-center gap-2">
                    {ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    )}
                    <span className="min-w-0 truncate font-medium text-fg">{s.domain}</span>
                    <Badge variant={ok ? 'success' : 'danger'}>{s.status}</Badge>
                    <span className="ml-auto shrink-0 text-xs text-fg-subtle">
                      {s.finishedAt ? fmtDateTime(s.finishedAt) : ''}
                    </span>
                  </div>
                  {s.status === 'failed' && s.error ? (
                    <p className="ml-6 line-clamp-2 text-xs text-fg-muted">{s.error}</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
