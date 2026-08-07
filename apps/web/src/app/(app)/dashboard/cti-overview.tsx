import { Skull, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { StatCard } from '../../../components/ui/stat-card';
import { fetchRansomwareLandscape } from '@vacti/threat-intel';
import { tx, type Locale } from '../../../lib/i18n';

/**
 * Lightweight ransomware highlight for the main dashboard. Does a (process-cached) network fetch,
 * so it lives behind its own <Suspense> boundary on the dashboard and never blocks first paint.
 * The fetch degrades to empty results on error, so this always renders something.
 */
export async function RansomwareHighlight({ locale = 'en' }: { locale?: Locale }) {
  const ransomware = await fetchRansomwareLandscape({ recentLimit: 6 });
  const feed = ransomware.indonesia.length ? ransomware.indonesia : ransomware.recent;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Skull className="size-4 text-danger" /> {tx(locale, 'Ransomware landscape', 'Lanskap ransomware')}
        </CardTitle>
        {ransomware.stats.lastUpdate ? (
          <span className="text-xs text-fg-subtle">{ransomware.stats.lastUpdate.slice(0, 10)}</span>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatCard label={tx(locale, 'Victims', 'Korban')} value={ransomware.stats.victims.toLocaleString()} />
          <StatCard label={tx(locale, 'Groups', 'Grup')} value={ransomware.stats.groups} />
          <StatCard label={tx(locale, 'ID victims', 'Korban ID')} value={ransomware.indonesia.length} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {ransomware.indonesia.length
            ? tx(locale, 'Recently disclosed · Indonesia', 'Baru terungkap · Indonesia')
            : tx(locale, 'Recently disclosed', 'Baru terungkap')}
        </div>
        {feed.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">{tx(locale, 'Feed unavailable.', 'Feed tidak tersedia.')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {feed.slice(0, 5).map((v, i) => (
              <li key={`${v.title}-${i}`} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {v.country === 'ID' ? <Flame className="mr-1 inline size-3 text-danger" /> : null}
                  {v.title || v.website || tx(locale, 'unknown', 'tidak diketahui')}
                </span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {v.group} · {v.country} · {v.discovered.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RansomwareHighlightFallback({ locale = 'en' }: { locale?: Locale }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skull className="size-4 text-danger" /> {tx(locale, 'Ransomware landscape', 'Lanskap ransomware')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-fg-subtle">
        {tx(locale, 'Loading ransomware landscape…', 'Memuat lanskap ransomware…')}
      </CardContent>
    </Card>
  );
}
