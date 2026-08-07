import Link from 'next/link';
import Form from 'next/form';
import { redirect } from 'next/navigation';
import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { ShieldAlert, FileSearch, Network } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Select } from '../../../components/ui/select';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { EmptyState } from '../../../components/ui/empty-state';
import { Pagination } from '../../../components/ui/pagination';
import { LEAK_STATUS_LABEL, userCan, Permission } from '@vacti/core';
import { analyzeEndpoints } from '@vacti/recon';
import { projects, scans, discoveredUrls, exposureFindings, ipResolutions, ipResolutionSightings } from '@vacti/db';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';
import { getActiveProjectId } from '../../../lib/active-project';
import { tenantScope, scopeWhere } from '../../../lib/tenancy';
import { bulkReviewExposureAction } from '../../../lib/surface-actions';
import { ExposureTable } from './exposure-table';
import { PassiveReconRunner } from './passive-recon-runner';
import { SurfaceExportMenu } from './export-menu';

export const dynamic = 'force-dynamic';
const PAGE = 25;

export default async function SurfacePage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    cat?: string;
    q?: string;
    upage?: string;
    scan?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const db = getDb();
  const t = await tenantScope(user);
  const projectRows = await db
    .select()
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));
  const sp = await searchParams;
  const projectId = await getActiveProjectId(sp.project, projectRows);
  if (!projectId) {
    return (
      <>
        <PageHeader title="Attack Surface" />
        <EmptyState
          icon={<FileSearch />}
          title={tx(locale, 'No project yet', 'Belum ada project')}
          description={tx(
            locale,
            'Create a project to run passive recon.',
            'Buat project untuk menjalankan passive recon.',
          )}
        />
      </>
    );
  }
  const canTriage = userCan(user, Permission.ModifyScanResults);
  const cat = sp.cat ?? 'all';
  const q = (sp.q ?? '').trim();
  const upage = Math.max(1, Number(sp.upage ?? 1) || 1);
  const diffScanId = (sp.scan ?? '').trim(); // when set: show only NEW discoveries from this scan

  const urlWhere = and(
    eq(discoveredUrls.projectId, projectId),
    cat !== 'all' ? eq(discoveredUrls.categorySlug, cat) : undefined,
    q ? ilike(discoveredUrls.urlText, `%${q}%`) : undefined,
    diffScanId ? eq(discoveredUrls.firstScanId, diffScanId) : undefined,
  );
  // Exposure findings are filtered/paginated client-side (ExposureTable) - scope only by project +
  // optional scan-diff here, then hand the full set (capped) to the client for search/filter.
  const findWhere = and(
    eq(exposureFindings.projectId, projectId),
    diffScanId ? eq(exposureFindings.scanId, diffScanId) : undefined,
  );

  const [catCounts, urls, urlTotal, types, finds, findTotal, ips, ipTotal] = await Promise.all([
    db
      .select({ slug: discoveredUrls.categorySlug, n: count() })
      .from(discoveredUrls)
      .where(eq(discoveredUrls.projectId, projectId))
      .groupBy(discoveredUrls.categorySlug),
    db
      .select()
      .from(discoveredUrls)
      .where(urlWhere)
      .orderBy(desc(discoveredUrls.createdAt))
      .limit(PAGE)
      .offset((upage - 1) * PAGE),
    db.select({ n: count() }).from(discoveredUrls).where(urlWhere),
    db
      .select({ t: exposureFindings.findingType, n: count() })
      .from(exposureFindings)
      .where(eq(exposureFindings.projectId, projectId))
      .groupBy(exposureFindings.findingType),
    db
      .select({
        id: exposureFindings.id,
        findingType: exposureFindings.findingType,
        snippet: exposureFindings.snippet,
        urlText: exposureFindings.urlText,
        status: exposureFindings.status,
        analystNote: exposureFindings.analystNote,
      })
      .from(exposureFindings)
      .where(findWhere)
      .orderBy(desc(exposureFindings.createdAt))
      .limit(2000),
    db.select({ n: count() }).from(exposureFindings).where(findWhere),
    db
      .select({
        ip: ipResolutions.ipAddress,
        latest: ipResolutions.latestResolvedAt,
        hosts: sql<string>`string_agg(distinct ${ipResolutionSightings.hostname}, ', ')`,
      })
      .from(ipResolutions)
      .leftJoin(ipResolutionSightings, eq(ipResolutionSightings.ipResolutionId, ipResolutions.id))
      .where(eq(ipResolutions.projectId, projectId))
      .groupBy(ipResolutions.ipAddress, ipResolutions.latestResolvedAt)
      .orderBy(desc(ipResolutions.latestResolvedAt))
      .limit(50),
    db.select({ n: count() }).from(ipResolutions).where(eq(ipResolutions.projectId, projectId)),
  ]);

  // Endpoint / parameter discovery - derived from discovered URLs for the project. The result is a
  // top-N summary (params/auth), so a 2000-URL sample is plenty; the previous 5000 cap re-ran a large
  // scan + analysis on every render with no visible benefit. Bound the work to keep the page fast.
  const allUrlRows = await db
    .select({ u: discoveredUrls.urlText })
    .from(discoveredUrls)
    .where(eq(discoveredUrls.projectId, projectId))
    .limit(2000);
  const endpoints = analyzeEndpoints(allUrlRows.map((r) => r.u));

  // Scan-diff: recent passive/full scans for the picker ("show only new discoveries from a scan").
  // Completed only: a queued/failed scan would show "0 new" indistinguishable from a real result.
  const passiveScans = await db
    .select({ id: scans.id, createdAt: scans.createdAt, mode: scans.mode })
    .from(scans)
    .where(and(eq(scans.projectId, projectId), inArray(scans.mode, ['passive', 'full']), eq(scans.status, 'completed')))
    .orderBy(desc(scans.createdAt))
    .limit(20);

  const urlPages = Math.max(1, Math.ceil(Number(urlTotal[0]!.n) / PAGE));
  const totalUrls = catCounts.reduce((a, c) => a + Number(c.n), 0);
  const keep = `project=${projectId}${diffScanId ? `&scan=${diffScanId}` : ''}`;

  return (
    <>
      <PageHeader
        title="Attack Surface"
        description={tx(
          locale,
          'Passive OSINT discovery (VirusTotal + Wayback): URLs, exposure findings, and IP resolutions. Run passive recon to populate (uses your VirusTotal key).',
          'Discovery passive OSINT (VirusTotal + Wayback): URLs, exposure findings, dan IP resolutions. Jalankan passive recon untuk mengisi data (memakai VirusTotal key Anda).',
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PassiveReconRunner projectId={projectId} locale={locale} />
            <SurfaceExportMenu projectId={projectId} locale={locale} />
          </div>
        }
      />

      {/* Scan-diff: show only what a chosen scan newly discovered. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Form action="/surface" className="flex items-center gap-1.5">
          <input type="hidden" name="project" value={projectId} />
          <Select name="scan" defaultValue={diffScanId} className="h-8 w-64 text-xs" aria-label="Diff: new in scan">
            <option value="">{tx(locale, 'Diff: all discoveries', 'Diff: semua temuan')}</option>
            {passiveScans.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(locale, 'New in', 'Baru di')} {s.mode} scan {s.id.slice(0, 8)} ·{' '}
                {new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ')}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="ghost" size="sm">
            {tx(locale, 'Apply diff', 'Terapkan diff')}
          </Button>
        </Form>
        {diffScanId ? (
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <Badge variant="accent">
              {tx(locale, 'Showing NEW discoveries from scan', 'Menampilkan temuan BARU dari scan')}{' '}
              {diffScanId.slice(0, 8)}
            </Badge>
            <Link href={`/surface?project=${projectId}`} className="text-accent hover:underline">
              {tx(locale, 'clear', 'hapus')}
            </Link>
          </span>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{totalUrls}</div>
            <div className="text-xs text-fg-muted">{tx(locale, 'Discovered URLs', 'URL ditemukan')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{Number(findTotal[0]!.n)}</div>
            <div className="text-xs text-fg-muted">{tx(locale, 'Exposure findings', 'Exposure findings')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{Number(ipTotal[0]!.n)}</div>
            <div className="text-xs text-fg-muted">{tx(locale, 'IP resolutions', 'IP resolutions')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{types.length}</div>
            <div className="text-xs text-fg-muted">{tx(locale, 'Exposure types', 'Tipe exposure')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Exposure findings */}
      <Card className="mt-2">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-accent" /> {tx(locale, 'Exposure findings', 'Exposure findings')}
          </CardTitle>
          {/* Bulk-by-filter: mark ALL of the project's findings (honours the active scan-diff). The
              per-selection checkbox bulk + search/type/status filters live inside ExposureTable. */}
          {canTriage && finds.length > 0 ? (
            <ActionForm action={bulkReviewExposureAction} className="flex items-center gap-1.5">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="type" value="all" />
              <input type="hidden" name="filter" value="all" />
              <Select name="status" defaultValue="investigating" className="h-8 w-36 text-xs" aria-label="Bulk status">
                {Object.entries(LEAK_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {tx(locale, 'Mark all', 'Tandai semua')}: {l}
                  </option>
                ))}
              </Select>
              <ActionSubmit variant="outline" size="sm">
                {tx(locale, 'Apply', 'Terapkan')}
              </ActionSubmit>
            </ActionForm>
          ) : null}
        </CardHeader>
        <CardContent className="pt-0">
          {finds.length === 0 ? (
            <p className="py-3 text-sm text-fg-muted">
              {tx(
                locale,
                'No exposure findings match - run a passive or full scan.',
                'Tidak ada exposure findings yang cocok - jalankan passive atau full scan.',
              )}
            </p>
          ) : (
            <ExposureTable findings={finds} canTriage={canTriage} locale={locale} />
          )}
        </CardContent>
      </Card>

      {/* Discovered URLs */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="size-4 text-accent" /> {tx(locale, 'Discovered URLs', 'URL ditemukan')}
          </CardTitle>
          <Form action="/surface" className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="project" value={projectId} />
            <Select name="cat" defaultValue={cat} className="h-8 w-44 text-xs" aria-label="Filter by category">
              <option value="all">{tx(locale, 'All categories', 'Semua kategori')}</option>
              {catCounts
                .filter((c) => c.slug)
                .map((c) => (
                  <option key={c.slug} value={c.slug!}>
                    {c.slug} ({Number(c.n)})
                  </option>
                ))}
            </Select>
            <Input
              name="q"
              defaultValue={q}
              placeholder={tx(locale, 'Search URL…', 'Cari URL…')}
              className="h-8 w-48 text-xs"
            />
            <Button type="submit" variant="ghost" size="sm">
              {tx(locale, 'Filter', 'Filter')}
            </Button>
          </Form>
        </CardHeader>
        <CardContent className="pt-0">
          {urls.length === 0 ? (
            <p className="py-3 text-sm text-fg-muted">
              {tx(locale, 'No discovered URLs match.', 'Tidak ada URL ditemukan yang cocok.')}
            </p>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>URL</TH>
                    <TH>{tx(locale, 'Category', 'Kategori')}</TH>
                    <TH>{tx(locale, 'Source', 'Sumber')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {urls.map((u) => (
                    <TR key={u.id}>
                      <TD className="max-w-xl truncate font-mono text-xs">
                        <a
                          href={u.urlText}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                          title={u.urlText}
                        >
                          {u.urlText}
                        </a>
                      </TD>
                      <TD>
                        {u.categorySlug ? (
                          <Badge variant="neutral">{u.categorySlug}</Badge>
                        ) : (
                          <span className="text-fg-subtle">-</span>
                        )}
                      </TD>
                      <TD className="max-w-[10rem] text-xs text-fg-subtle">
                        <div className="truncate" title={(u.sources ?? []).join(', ')}>
                          {(u.sources ?? []).join(', ')}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination
                page={upage}
                totalPages={urlPages}
                total={Number(urlTotal[0]!.n)}
                label={tx(locale, 'URLs', 'URLs')}
                makeHref={(p) => `/surface?${keep}&upage=${p}&cat=${cat}&q=${encodeURIComponent(q)}`}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Endpoints & parameters (derived from discovered URLs) */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="size-4 text-accent" />{' '}
            {tx(locale, 'Endpoints & parameters', 'Endpoints & parameter')} · {endpoints.paramCount}{' '}
            {tx(locale, 'params', 'param')} · {endpoints.authCount} auth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {endpoints.params.length === 0 && endpoints.authEndpoints.length === 0 ? (
            <p className="py-1 text-sm text-fg-muted">
              {tx(
                locale,
                'No parameters or auth endpoints derived yet.',
                'Belum ada parameter atau auth endpoint yang diturunkan.',
              )}
            </p>
          ) : (
            <>
              {endpoints.params.length ? (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                    {tx(locale, 'Top parameters', 'Parameter teratas')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {endpoints.params.slice(0, 30).map((p) => (
                      <Badge key={p.name} variant="neutral">
                        {p.name} · {p.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {endpoints.authEndpoints.length ? (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                    {tx(locale, 'Auth / admin endpoints', 'Auth / admin endpoints')}
                  </div>
                  <ul className="space-y-0.5">
                    {endpoints.authEndpoints.slice(0, 20).map((e) => (
                      <li key={e} className="truncate font-mono text-xs">
                        <a
                          href={e}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                          title={e}
                        >
                          {e}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* IP directory (passive DNS) */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-accent" />{' '}
            {tx(locale, 'IP directory (passive DNS)', 'Direktori IP (passive DNS)')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {ips.length === 0 ? (
            <p className="py-3 text-sm text-fg-muted">
              {tx(
                locale,
                'No IP resolutions yet - requires a VirusTotal API key (passive DNS).',
                'Belum ada IP resolutions - membutuhkan VirusTotal API key (passive DNS).',
              )}
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>IP</TH>
                  <TH>{tx(locale, 'Hostnames', 'Hostname')}</TH>
                  <TH>{tx(locale, 'Latest resolved', 'Terakhir resolved')}</TH>
                </TR>
              </THead>
              <TBody>
                {ips.map((r) => (
                  <TR key={r.ip}>
                    <TD className="font-mono text-sm">{r.ip}</TD>
                    <TD className="max-w-xs text-xs text-fg-muted">
                      <div className="truncate" title={r.hosts ?? ''}>
                        {r.hosts ?? '-'}
                      </div>
                    </TD>
                    <TD className="text-xs text-fg-subtle">
                      {r.latest ? new Date(r.latest).toISOString().slice(0, 10) : '-'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
