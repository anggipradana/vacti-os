import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { KeyRound } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { apiTokens } from '@vacti/db';
import { userCan, Permission } from '@vacti/core';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { revokeTokenAction } from '../../../../lib/actions';
import CreateToken from './create-token';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function TokensPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // API tokens - SysAdmin only.
  if (!userCan(user, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const rows = await getDb()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.createdAt));
  return (
    <>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
          <span className="font-medium">{tx(locale, 'API reference:', 'Referensi API:')}</span>{' '}
          {tx(
            locale,
            'every action is scriptable via the typed REST API (Bearer token).',
            'setiap aksi dapat di-script via REST API bertipe (Bearer token).',
          )}{' '}
          <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {tx(locale, 'Open API docs (Redoc) →', 'Buka dokumentasi API (Redoc) →')}
          </a>{' '}
          ·{' '}
          <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            OpenAPI JSON
          </a>
          <div className="mt-1 text-xs text-fg-subtle">
            {tx(locale, 'Usage guide: see', 'Panduan penggunaan: lihat')}{' '}
            <span className="font-mono">docs/tutorials/getting-started.md</span>{' '}
            {tx(locale, 'in the repository.', 'di repository.')}
          </div>
        </div>
        <CreateToken locale={locale} />
        <div data-testid="token-list">
          {rows.length === 0 ? (
            <EmptyState
              icon={<KeyRound />}
              title={tx(locale, 'No tokens yet', 'Belum ada token')}
              description={tx(locale, 'Create a token to call the vacti API.', 'Buat token untuk memanggil API vacti.')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{tx(locale, 'Label', 'Label')}</TH>
                  <TH>{tx(locale, 'Created', 'Dibuat')}</TH>
                  <TH className="text-right">{tx(locale, 'Actions', 'Aksi')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.label}</TD>
                    <TD className="text-sm text-fg-subtle">{t.createdAt.toISOString().slice(0, 10)}</TD>
                    <TD className="text-right">
                      <form action={revokeTokenAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton
                          confirm={tx(
                            locale,
                            'Revoke this API token? Any client using it will stop working.',
                            'Cabut API token ini? Klien yang memakainya akan berhenti bekerja.',
                          )}
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10"
                        >
                          {tx(locale, 'Revoke', 'Cabut')}
                        </ConfirmButton>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
