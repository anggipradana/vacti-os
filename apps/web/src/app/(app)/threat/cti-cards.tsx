import { eq, inArray } from 'drizzle-orm';
import { Skull, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { StatCard } from '../../../components/ui/stat-card';
import { fetchKev, fetchEpss, fetchRansomwareLandscape } from '@vacti/threat-intel';
import { scans, vulnerabilities } from '@vacti/db';
import { getDb } from '../../../lib/db';
import { tx, type Locale } from '../../../lib/i18n';
import { RansomwareFeed } from './ransomware-feed';

// Cache the intel feeds in Next's data cache (refresh hourly) so big files aren't refetched per render.
const cached = ((url: string) => fetch(url, { next: { revalidate: 3600 } })) as typeof fetch;

/**
 * Cyber-Threat-Intelligence landscape: global ransomware activity (from the ransomware-dashboard
 * mirror) and the CISA Known-Exploited-Vulnerabilities catalog cross-referenced against this
 * project's own findings, with EPSS exploit-probability scores. All feeds degrade gracefully.
 */
export async function CtiCards({ projectId, locale = 'en' }: { projectId: string; locale?: Locale }) {
  const db = getDb();
  const projectScans = await db.select({ id: scans.id }).from(scans).where(eq(scans.projectId, projectId));
  const scanIds = projectScans.map((s) => s.id);
  const vulns = scanIds.length
    ? await db
        .select({ name: vulnerabilities.name, severity: vulnerabilities.severity, cveIds: vulnerabilities.cveIds })
        .from(vulnerabilities)
        .where(inArray(vulnerabilities.scanId, scanIds))
    : [];
  const projectCves = [...new Set(vulns.flatMap((v) => v.cveIds).map((c) => c.toUpperCase()))];

  const [kev, ransomware, epss] = await Promise.all([
    fetchKev({ fetchImpl: cached }),
    // Ransomware victims feed is ~25MB (over Next's cache limit); the lib memoises it in-process.
    fetchRansomwareLandscape({ recentLimit: 200 }),
    projectCves.length ? fetchEpss(projectCves, { fetchImpl: cached }) : Promise.resolve(new Map()),
  ]);

  // Findings whose CVE is in the CISA KEV catalog (actively exploited in the wild).
  const kevFindings = vulns
    .flatMap((v) =>
      v.cveIds
        .map((c) => c.toUpperCase())
        .filter((c) => kev.has(c))
        .map((cve) => ({
          cve,
          name: v.name,
          ransomware: kev.get(cve)!.ransomware,
          epss: epss.get(cve)?.epss ?? 0,
        })),
    )
    .sort((a, b) => b.epss - a.epss);
  const dedupKev = [...new Map(kevFindings.map((f) => [f.cve, f])).values()];

  // Trim the victims payload sent to the client: RansomwareFeed only shows 8 after filtering, and the
  // country/sector dropdown counts come from separate `countries`/`sectors` props (not this array), so
  // capping here doesn't change the visible UI. victims is already sorted by `discovered` desc, so we
  // keep the newest 100 - but retain *all* default-country (ID) victims so the default ID filter view
  // is never starved by the cap.
  const VICTIM_CAP = 100;
  const defaultCountry = ransomware.countries.some((c) => c.code === 'ID') ? 'ID' : null;
  const cappedVictims =
    ransomware.victims.length <= VICTIM_CAP
      ? ransomware.victims
      : [
          ...ransomware.victims.slice(0, VICTIM_CAP),
          ...(defaultCountry ? ransomware.victims.slice(VICTIM_CAP).filter((v) => v.country === defaultCountry) : []),
        ];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* Ransomware landscape */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Skull className="size-4 text-danger" /> {tx(locale, 'Ransomware landscape', 'Ransomware landscape')}
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
          {ransomware.topGroups.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {ransomware.topGroups.slice(0, 6).map((g) => (
                <Badge key={g.group} variant="neutral">
                  {g.group} · {g.count}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {tx(locale, 'Recently disclosed', 'Baru diungkap')}
          </div>
          <RansomwareFeed
            victims={cappedVictims}
            countries={ransomware.countries}
            sectors={ransomware.sectors}
            locale={locale}
          />
        </CardContent>
      </Card>

      {/* CISA KEV cross-referenced with this project */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-high" />{' '}
            {tx(locale, 'Known exploited (CISA KEV)', 'Known exploited (CISA KEV)')}
          </CardTitle>
          <span className="text-xs text-fg-subtle">
            {kev.size.toLocaleString()} {tx(locale, 'in catalog', 'di katalog')}
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-2 text-sm text-fg-muted">
            {dedupKev.length === 0
              ? tx(
                  locale,
                  "None of this project's findings are in the CISA KEV catalog.",
                  'Tidak ada findings project ini yang ada di katalog CISA KEV.',
                )
              : tx(
                  locale,
                  `${dedupKev.length} finding CVE(s) are actively exploited in the wild. Prioritise these.`,
                  `${dedupKev.length} CVE dari findings aktif dieksploitasi di dunia nyata. Prioritaskan ini.`,
                )}
          </p>
          {dedupKev.length > 0 ? (
            <ul className="divide-y divide-border">
              {dedupKev.slice(0, 10).map((f) => (
                <li key={f.cve} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-accent">{f.cve}</span>
                    {f.ransomware ? (
                      <Badge variant="danger" className="ml-2">
                        ransomware
                      </Badge>
                    ) : null}
                    <span className="ml-2 text-fg-muted">{f.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">EPSS {(f.epss * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
