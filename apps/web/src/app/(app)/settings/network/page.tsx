import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { userCan, Permission } from '@vacti/core';
import { networkSettings } from '@vacti/db';
import { getDb, env } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';
import { saveNetworkProxyAction } from '../../../../lib/network-actions';

export const dynamic = 'force-dynamic';

/**
 * Network settings: the app-level outbound proxy the worker uses for OSINT/deep-fetch traffic. SysAdmin only.
 * The DB value wins over env PROXY_URL; a change takes effect on the next worker restart (the dispatcher is
 * set once at worker boot). The proxy URL may carry credentials, so it is never logged in full.
 */
export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const sp = await searchParams;

  const [row] = await getDb().select().from(networkSettings).where(eq(networkSettings.id, 'default'));
  const proxyUrl = row?.proxyUrl ?? '';
  const envFallback = env().PROXY_URL ?? '';
  // What the worker will actually use: the DB value if set, else the env fallback.
  const effective = proxyUrl || envFallback;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{tx(locale, 'Network', 'Jaringan')}</h1>
        <p className="text-sm text-fg-subtle">
          {tx(
            locale,
            'Route the worker OSINT and deep-fetch traffic through an outbound proxy. Supports http(s):// and socks4/socks5://. Leave blank to disable.',
            'Arahkan lalu lintas OSINT dan deep-fetch worker melalui proxy keluar. Mendukung http(s):// dan socks4/socks5://. Kosongkan untuk menonaktifkan.',
          )}
        </p>
      </div>

      {sp.error === 'scheme' ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {tx(
            locale,
            'Unsupported proxy URL. Use http://, https://, socks4://, or socks5:// (with host:port).',
            'URL proxy tidak didukung. Gunakan http://, https://, socks4://, atau socks5:// (dengan host:port).',
          )}
        </div>
      ) : null}
      {sp.saved === '1' ? (
        <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {tx(locale, 'Proxy settings saved.', 'Pengaturan proxy tersimpan.')}
        </div>
      ) : null}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {tx(locale, 'Outbound proxy', 'Proxy keluar')}
            {effective ? (
              <Badge variant="success">{tx(locale, 'enabled', 'aktif')}</Badge>
            ) : (
              <Badge variant="neutral">{tx(locale, 'disabled', 'nonaktif')}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={saveNetworkProxyAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proxyUrl">{tx(locale, 'Proxy URL', 'URL Proxy')}</Label>
              <Input
                id="proxyUrl"
                name="proxyUrl"
                defaultValue={proxyUrl}
                placeholder="http(s)://host:port or socks5://host:port"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-fg-subtle">
                {tx(
                  locale,
                  'Applies to worker OSINT and deep-fetch traffic only. Takes effect on the next worker restart. Overrides the PROXY_URL environment variable. Credentials (user:pass) are supported and never logged in full.',
                  'Berlaku hanya untuk lalu lintas OSINT dan deep-fetch worker. Berlaku setelah worker di-restart berikutnya. Menggantikan variabel environment PROXY_URL. Kredensial (user:pass) didukung dan tidak pernah dicatat penuh.',
                )}
              </p>
            </div>
            <Button type="submit" variant="primary">
              {tx(locale, 'Save', 'Simpan')}
            </Button>
          </form>

          {proxyUrl ? (
            // Clear posts proxyUrl="" in its own form so the text input's value is not sent alongside it.
            <form action={saveNetworkProxyAction}>
              <input type="hidden" name="proxyUrl" value="" />
              <Button type="submit" variant="ghost" className="text-danger hover:bg-danger/10">
                {tx(locale, 'Clear proxy', 'Hapus proxy')}
              </Button>
            </form>
          ) : null}

          {!proxyUrl && envFallback ? (
            <p className="text-xs text-fg-subtle">
              {tx(
                locale,
                'No proxy is configured here, so the worker falls back to the PROXY_URL environment variable.',
                'Belum ada proxy yang diatur di sini, jadi worker memakai variabel environment PROXY_URL.',
              )}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
