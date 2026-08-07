import Link from 'next/link';
import Form from 'next/form';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { searchAll } from '@vacti/db';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import { tenantScope } from '../../../lib/tenancy';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const { q = '' } = await searchParams;
  // Confine results to the caller's member projects (SysAdmin => all).
  const t = await tenantScope(user);
  const { hits } = q.trim() ? await searchAll(getDb(), q, { projectIds: t.all ? null : t.projectIds }) : { hits: [] };

  return (
    <>
      <PageHeader
        title={tx(locale, 'Search', 'Cari')}
        description={tx(
          locale,
          'Find projects, targets, scans, subdomains, endpoints and findings.',
          'Temukan projects, targets, scans, subdomains, endpoints dan findings.',
        )}
      />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <Form action="/search" className="flex items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder={tx(locale, 'Search across everything…', 'Cari di semua…')}
              autoFocus
            />
            <Button type="submit">
              <Search className="size-4" /> {tx(locale, 'Search', 'Cari')}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {!q.trim() ? (
        <p className="text-sm text-fg-muted">{tx(locale, 'Type a query above.', 'Ketik kueri di atas.')}</p>
      ) : hits.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={tx(locale, 'No matches', 'Tidak ada kecocokan')}
          description={tx(locale, `Nothing found for “${q}”.`, `Tidak ada hasil untuk “${q}”.`)}
        />
      ) : (
        <div className="space-y-2">
          {hits.map((h) => (
            <Link key={`${h.kind}-${h.id}`} href={h.href}>
              <Card className="transition-colors hover:border-accent">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <span className="font-mono text-sm">{h.label}</span>
                    {h.sublabel ? <span className="ml-2 text-xs text-fg-subtle">{h.sublabel}</span> : null}
                  </div>
                  <Badge variant="neutral">{h.kind}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
