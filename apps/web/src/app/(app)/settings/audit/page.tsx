import { redirect } from 'next/navigation';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { Card, CardContent } from '../../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { userCan, Permission } from '@vacti/core';
import { auditLog, users } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const db = getDb();
  // Join the actor's email in SQL rather than fetching all users and mapping in JS.
  const rows = await db
    .select({ ...getTableColumns(auditLog), actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          title={tx(locale, 'No audit entries yet', 'Belum ada entri audit')}
          description={tx(
            locale,
            'Actions like scans, role changes and key updates appear here.',
            'Aksi seperti scan, perubahan peran, dan pembaruan key muncul di sini.',
          )}
        />
      ) : (
        <Card>
          <CardContent className="pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>{tx(locale, 'When', 'Waktu')}</TH>
                  <TH>{tx(locale, 'Actor', 'Pelaku')}</TH>
                  <TH>{tx(locale, 'Action', 'Aksi')}</TH>
                  <TH>{tx(locale, 'Resource', 'Sumber Daya')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-mono text-xs text-fg-muted">
                      {new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                    </TD>
                    <TD className="text-sm">
                      {r.actorId ? (
                        (r.actorEmail ?? r.actorId.slice(0, 8))
                      ) : (
                        <span className="text-fg-subtle">{tx(locale, 'system', 'sistem')}</span>
                      )}
                    </TD>
                    <TD>
                      <Badge variant="neutral">{r.action}</Badge>
                    </TD>
                    <TD className="font-mono text-xs text-fg-muted">{r.resource}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
