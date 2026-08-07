import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { count, desc, eq, sql } from 'drizzle-orm';
import { RefreshCw, ShieldCheck, Bug, Activity, Plus } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { StatCard } from '../../../components/ui/stat-card';
import { RiskGauge } from '../../../components/ui/risk-gauge';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Textarea } from '../../../components/ui/textarea';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { ProjectSwitcher } from '../../../components/project-switcher';
import { CollapsibleCard } from '../../../components/ui/collapsible-card';
import { TargetsManager } from '../../../components/targets-manager';
import { computeProjectRisk } from '@vacti/threat-intel';
import { LEAK_STATUS_LABEL, NEWS_STATUS_LABEL, userCan, Permission } from '@vacti/core';
import { SECTORS } from '@vacti/threat-intel';
import {
  projects,
  otxThreatData,
  leakcheckData,
  manualIndicators,
  threatIntelStatus,
  threatNews,
  exposureFindings,
} from '@vacti/db';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import {
  refreshTiAction,
  addIndicatorAction,
  editIndicatorAction,
  deleteIndicatorAction,
  setSectorAction,
  bulkReviewNewsAction,
  bulkReviewLeaksAction,
} from '../../../lib/threat-actions';
import { NewsTriageButton } from './news-triage-button';
import { NarrativeCard } from './narrative-card';
import { CtiCards } from './cti-cards';
import { BrandNews } from './brand-news';
import { LeakTable } from './leak-table';
import { SectorNewsList } from './sector-news-list';
import { getActiveProjectId } from '../../../lib/active-project';
import { tenantScope, scopeWhere } from '../../../lib/tenancy';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function ThreatPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    bnews?: string;
    leak?: string;
    news?: string;
    tpage?: string;
    ok?: string;
    error?: string;
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
  const brandFilter = sp.bnews ?? 'all';
  // Deep-link filters (dashboard "Needs review" tiles): only known statuses, else show all.
  const leakFilter = sp.leak && sp.leak in LEAK_STATUS_LABEL ? sp.leak : 'all';
  const newsFilter = sp.news && sp.news in NEWS_STATUS_LABEL ? sp.news : 'all';

  if (!projectId) {
    return (
      <>
        <PageHeader title="Cyber Threat Intelligence" />
        <EmptyState
          icon={<ShieldCheck />}
          title={tx(locale, 'No project yet', 'Belum ada project')}
          description={tx(
            locale,
            'Create a project to gather threat intel.',
            'Buat project untuk mengumpulkan threat intel.',
          )}
        />
      </>
    );
  }

  const project = projectRows.find((p) => p.id === projectId);
  const sector = project?.sector ?? 'banking';
  const [risk, otx, leakStatRows, leaks, indicators, statusRows, news, exposureTypes] = await Promise.all([
    computeProjectRisk(db, projectId),
    db.select().from(otxThreatData).where(eq(otxThreatData.projectId, projectId)).limit(100),
    db
      .select({
        total: count(),
        // "Unresolved" must match the statuses that actually feed the risk score (new/investigating/
        // confirmed), not the legacy `checked` boolean which can disagree (a confirmed leak is
        // checked=true yet still scored).
        unchecked: sql<number>`count(*) filter (where ${leakcheckData.status} in ('new','investigating','confirmed'))`,
      })
      .from(leakcheckData)
      .where(eq(leakcheckData.projectId, projectId)),
    db.select().from(leakcheckData).where(eq(leakcheckData.projectId, projectId)).orderBy(desc(leakcheckData.id)),
    db.select().from(manualIndicators).where(eq(manualIndicators.projectId, projectId)),
    db.select().from(threatIntelStatus).where(eq(threatIntelStatus.projectId, projectId)),
    db.select().from(threatNews).where(eq(threatNews.sector, sector)).orderBy(desc(threatNews.publishedAt)).limit(15),
    db
      .select({ type: exposureFindings.findingType, n: count() })
      .from(exposureFindings)
      .where(eq(exposureFindings.projectId, projectId))
      .groupBy(exposureFindings.findingType),
  ]);
  // Passive exposure findings summary (CTI surfacing). Credential-class types overlap LeakCheck.
  const exposureTotal = exposureTypes.reduce((a, t) => a + Number(t.n), 0);
  const CRED_TYPES = new Set(['combo-list-cred', 'basic-auth-url', 'credential-like', 'email', 'db-connection']);
  const exposureCredTotal = exposureTypes.filter((t) => CRED_TYPES.has(t.type)).reduce((a, t) => a + Number(t.n), 0);
  const exposureTop = [...exposureTypes].sort((a, b) => Number(b.n) - Number(a.n)).slice(0, 6);
  const status = statusRows[0];
  const canTriage = userCan(user, Permission.ModifyScanResults);
  const pulses = otx.reduce((a, o) => a + o.pulses, 0);
  const malware = otx.reduce((a, o) => a + o.malwareCount, 0);
  const leakTotal = Number(leakStatRows[0]?.total ?? 0);
  const unchecked = Number(leakStatRows[0]?.unchecked ?? 0);

  return (
    <>
      <PageHeader
        title="Cyber Threat Intelligence"
        description={tx(
          locale,
          'OTX AlienVault, leaked credentials, manual indicators & unified risk score.',
          'OTX AlienVault, leaked credentials, indikator manual & skor risiko terpadu.',
        )}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <a href={`/reports/ti/${projectId}`} target="_blank" rel="noopener noreferrer">
                {tx(locale, 'Generate report', 'Buat laporan')}
              </a>
            </Button>
            <ActionForm action={refreshTiAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <ActionSubmit pendingText={tx(locale, 'Refreshing...', 'Menyegarkan...')}>
                <RefreshCw /> {tx(locale, 'Refresh', 'Segarkan')}
              </ActionSubmit>
            </ActionForm>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ProjectSwitcher projects={projectRows} current={projectId} basePath="/threat" />
        {status ? (
          <Badge variant={status.state === 'running' ? 'accent' : status.state === 'failed' ? 'danger' : 'neutral'}>
            {status.state === 'running'
              ? `${tx(locale, 'refreshing', 'menyegarkan')} ${status.progress}%`
              : `${tx(locale, 'last refresh', 'penyegaran terakhir')}: ${status.state}`}
          </Badge>
        ) : (
          <Badge variant="neutral">{tx(locale, 'never refreshed', 'belum pernah disegarkan')}</Badge>
        )}
        {!otx.length && leakTotal === 0 ? (
          <span className="text-xs text-fg-subtle">
            {tx(
              locale,
              'Set OTX_API_KEY / a leak-intelligence key to populate live data - features degrade gracefully.',
              'Atur OTX_API_KEY / key leak-intelligence untuk mengisi data live - fitur tetap berjalan tanpanya.',
            )}
          </span>
        ) : null}
      </div>

      <div className="mb-4">
        <CollapsibleCard title={tx(locale, 'Monitored targets', 'Target yang dimonitor')}>
          <TargetsManager
            user={user}
            locale={locale}
            projectId={projectId}
            projectRows={projectRows}
            basePath="/threat"
            page={Math.max(1, Number(sp.tpage ?? 1) || 1)}
            ok={sp.ok}
            error={sp.error}
          />
        </CollapsibleCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tx(locale, 'Unified risk score', 'Skor risiko terpadu')}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <RiskGauge score={risk.score} />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="OTX pulses" value={pulses} icon={<Activity />} />
          <StatCard label={tx(locale, 'Malware refs', 'Referensi malware')} value={malware} icon={<Bug />} />
          <StatCard
            label="Leaked creds"
            value={leakTotal}
            icon={<ShieldCheck />}
            hint={
              status?.leakTruncated
                ? `Leak intelligence reports ${status.leakFound ?? leakTotal}+ - capped`
                : `${unchecked} ${tx(locale, 'unchecked', 'belum dicek')}`
            }
          />
          <StatCard label={tx(locale, 'Indicators', 'Indikator')} value={indicators.length} icon={<Plus />} />
        </div>
      </div>
      {status?.leakTruncated ? (
        <p className="mt-2 text-xs text-fg-subtle">
          {tx(
            locale,
            `Leak intelligence found ${status.leakFound ?? leakTotal} breached credential(s) for this project but returns at most 1000 per query, so the stored list is truncated. The newest 1000 are kept; treat the count as a floor.`,
            `Leak intelligence menemukan ${status.leakFound ?? leakTotal} breached credential untuk project ini tetapi hanya mengembalikan maksimal 1000 per query, sehingga daftar yang tersimpan terpotong. 1000 terbaru disimpan; anggap jumlah ini sebagai batas bawah.`,
          )}
        </p>
      ) : null}

      <Suspense
        fallback={
          <div className="mt-4 text-sm text-fg-subtle">
            {tx(
              locale,
              'Loading threat landscape (KEV, EPSS, ransomware)…',
              'Memuat threat landscape (KEV, EPSS, ransomware)…',
            )}
          </div>
        }
      >
        <CtiCards projectId={projectId} locale={locale} />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-4 text-sm text-fg-subtle">{tx(locale, 'Loading brand news…', 'Memuat brand news…')}</div>
        }
      >
        <BrandNews
          projectId={projectId}
          brand={project?.brandQuery || project?.name || 'brand'}
          canTriage={canTriage}
          filter={brandFilter}
          locale={locale}
        />
      </Suspense>

      <NarrativeCard
        projectId={projectId}
        initial={status?.aiNarrative ?? null}
        canTriage={canTriage}
        locale={locale}
      />

      <Card className="mt-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>
            {tx(locale, 'Security news', 'Security news')} · {sector}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canTriage ? (
              <>
                <ActionForm action={bulkReviewNewsAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="sector" value={sector} />
                  <input type="hidden" name="filter" value="all" />
                  <Select name="status" defaultValue="reviewed" className="h-8 w-36 text-xs" aria-label="Bulk status">
                    {Object.entries(NEWS_STATUS_LABEL).map(([val, label]) => (
                      <option key={val} value={val}>
                        {tx(locale, 'Mark all', 'Tandai semua')}: {label}
                      </option>
                    ))}
                  </Select>
                  <ActionSubmit variant="outline" size="sm">
                    {tx(locale, 'Apply', 'Terapkan')}
                  </ActionSubmit>
                </ActionForm>
                <ActionForm
                  action={setSectorAction}
                  className="flex items-center gap-2"
                  confirm={tx(
                    locale,
                    "Fetching this sector's news keeps only the newest 15 headlines and removes older stored ones. Continue?",
                    'Mengambil news sektor ini hanya menyimpan 15 headline terbaru dan menghapus yang lebih lama. Lanjutkan?',
                  )}
                >
                  <input type="hidden" name="projectId" value={projectId} />
                  <Select name="sector" defaultValue={sector} className="w-40">
                    {Object.keys(SECTORS).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <ActionSubmit variant="outline" size="sm">
                    {tx(locale, 'Apply sector', 'Terapkan sektor')}
                  </ActionSubmit>
                </ActionForm>
                <NewsTriageButton projectId={projectId} kind="sector" locale={locale} />
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {news.length === 0 ? (
            <p className="py-2 text-sm text-fg-muted">
              {tx(
                locale,
                'No news yet - pick a sector and refresh to pull the latest security headlines.',
                'Belum ada news - pilih sektor dan segarkan untuk menarik security headline terbaru.',
              )}
            </p>
          ) : (
            <SectorNewsList
              initialStatus={newsFilter}
              locale={locale}
              items={news.map((n) => ({
                id: n.id,
                title: n.title,
                link: n.link,
                source: n.source,
                publishedAt: n.publishedAt ? new Date(n.publishedAt).toISOString() : null,
                status: n.status,
              }))}
              canTriage={canTriage}
            />
          )}
        </CardContent>
      </Card>

      {/* Passive exposure (from Attack Surface) - credential-class types overlap leaked credentials. */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Bug className="size-4 text-accent" /> Exposure (passive) · {exposureTotal}
          </CardTitle>
          <Link href={`/surface?project=${projectId}`} className="text-xs text-accent hover:underline">
            {tx(locale, 'View in Attack Surface', 'Lihat di Attack Surface')} →
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {exposureTotal === 0 ? (
            <p className="py-1 text-sm text-fg-muted">
              {tx(
                locale,
                'No passive exposure findings yet - run a passive or full scan from Scans.',
                'Belum ada passive exposure findings - jalankan passive atau full scan dari Scans.',
              )}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {exposureTop.map((t) => (
                  <Link
                    key={t.type}
                    href={`/surface?project=${projectId}&etype=${t.type}`}
                    title="Open in Attack Surface"
                  >
                    <Badge variant="danger">
                      {t.type} · {Number(t.n)}
                    </Badge>
                  </Link>
                ))}
              </div>
              {exposureCredTotal > 0 ? (
                <p className="text-xs text-fg-muted">
                  {tx(
                    locale,
                    `${exposureCredTotal} credential-class finding(s) overlap leaked credentials below - feeds the Exposure component of the risk score.`,
                    `${exposureCredTotal} credential-class finding tumpang tindih dengan leaked credentials di bawah - menjadi masukan komponen Exposure pada skor risiko.`,
                  )}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          {tx(locale, 'Leaked credentials', 'Leaked credentials')}
        </h2>
        {leakTotal > 0 && canTriage ? (
          <ActionForm action={bulkReviewLeaksAction} className="flex items-center gap-1.5">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="filter" value="all" />
            <Select name="status" defaultValue="investigating" className="h-8 w-40 text-xs" aria-label="Bulk status">
              {Object.entries(LEAK_STATUS_LABEL).map(([val, label]) => (
                <option key={val} value={val}>
                  {tx(locale, 'Mark all', 'Tandai semua')}: {label}
                </option>
              ))}
            </Select>
            <ActionSubmit variant="outline" size="sm">
              {tx(locale, 'Apply', 'Terapkan')}
            </ActionSubmit>
          </ActionForm>
        ) : null}
      </div>
      {leakTotal === 0 ? (
        <Card>
          <CardContent className="py-5 text-sm text-fg-muted">
            {tx(locale, 'No leaked credentials found.', 'Tidak ada leaked credentials ditemukan.')}
          </CardContent>
        </Card>
      ) : (
        <LeakTable
          initialStatus={leakFilter}
          locale={locale}
          leaks={leaks.map((l) => ({
            id: l.id,
            identifier: l.identifier,
            password: l.password,
            origin: l.origin,
            source: l.source,
            type: l.type,
            status: l.status,
          }))}
          canTriage={canTriage}
        />
      )}

      <h2 className="mb-1 mt-8 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
        {tx(locale, 'Monitored assets (manual indicators)', 'Aset yang dimonitor (indikator manual)')}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">
        {tx(
          locale,
          'Your public IPs and domains, checked against VirusTotal engines and OTX pulses on every refresh: a flagged asset usually means compromise, blacklisting, or abuse of your infrastructure.',
          'IP publik dan domain Anda, dicek terhadap engine VirusTotal dan OTX pulses pada setiap penyegaran: aset yang ditandai biasanya berarti kompromi, blacklisting, atau penyalahgunaan infrastruktur Anda.',
        )}
      </p>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardContent className="pt-5">
            <ActionForm action={addIndicatorAction} className="space-y-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="space-y-1.5">
                <Label htmlFor="type">{tx(locale, 'Type', 'Tipe')}</Label>
                <Select id="type" name="type">
                  <option value="domain">domain</option>
                  <option value="subdomain">subdomain</option>
                  <option value="ip">ip</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">{tx(locale, 'Value(s)', 'Nilai')}</Label>
                <Textarea
                  id="value"
                  name="value"
                  rows={4}
                  placeholder={'evil.example.com\nbad.example.com\n34.1.2.3'}
                  required
                />
                <p className="text-xs text-fg-subtle">
                  {tx(
                    locale,
                    'One per line (or comma/space separated) for bulk add.',
                    'Satu per baris (atau dipisah koma/spasi) untuk tambah massal.',
                  )}
                </p>
              </div>
              <ActionSubmit className="w-full">
                <Plus /> {tx(locale, 'Add indicator(s)', 'Tambah indikator')}
              </ActionSubmit>
            </ActionForm>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {indicators.length === 0 ? (
            <Card>
              <CardContent className="py-5 text-sm text-fg-muted">
                {tx(locale, 'No manual indicators.', 'Tidak ada indikator manual.')}
              </CardContent>
            </Card>
          ) : (
            indicators.map((ind) => (
              <Card key={ind.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{ind.value}</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          ind.verdict === 'malicious'
                            ? 'danger'
                            : ind.verdict === 'suspicious'
                              ? 'accent'
                              : ind.verdict === 'clean'
                                ? 'success'
                                : 'neutral'
                        }
                        title={
                          ind.lastCheckedAt
                            ? `${tx(locale, 'Last checked', 'Terakhir dicek')} ${ind.lastCheckedAt.toISOString()}`
                            : tx(locale, 'Not checked yet', 'Belum dicek')
                        }
                        data-testid={`indicator-verdict-${ind.id}`}
                      >
                        {ind.verdict === 'unknown' ? tx(locale, 'not checked', 'belum dicek') : ind.verdict}
                      </Badge>
                      <Badge variant="accent">{ind.type}</Badge>
                      {canTriage ? (
                        <ActionForm
                          action={deleteIndicatorAction}
                          confirm={tx(locale, 'Delete this indicator?', 'Hapus indikator ini?')}
                        >
                          <input type="hidden" name="id" value={ind.id} />
                          <ActionSubmit size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                            {tx(locale, 'Delete', 'Hapus')}
                          </ActionSubmit>
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                  {ind.lastCheckedAt ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      VT: {ind.vtMalicious ?? 0} malicious · {ind.vtSuspicious ?? 0} suspicious
                      {ind.vtTotal ? ` of ${ind.vtTotal} engines` : ''} · OTX: {ind.otxPulses ?? 0} pulse(s)
                    </p>
                  ) : null}
                  {canTriage ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
                        {tx(locale, 'Edit', 'Ubah')}
                      </summary>
                      <ActionForm action={editIndicatorAction} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={ind.id} />
                        <Select name="type" defaultValue={ind.type} aria-label="Type">
                          <option value="domain">domain</option>
                          <option value="subdomain">subdomain</option>
                          <option value="ip">ip</option>
                        </Select>
                        <Input
                          name="value"
                          defaultValue={ind.value}
                          placeholder={tx(locale, 'Value', 'Nilai')}
                          required
                        />
                        <Input
                          name="note"
                          defaultValue={ind.note ?? ''}
                          placeholder={tx(locale, 'Note (optional)', 'Catatan (opsional)')}
                        />
                        <ActionSubmit size="sm" variant="outline">
                          {tx(locale, 'Save', 'Simpan')}
                        </ActionSubmit>
                      </ActionForm>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
