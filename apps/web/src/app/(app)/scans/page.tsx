import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, count, eq, and, ne } from 'drizzle-orm';
import { Radar } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { StatusPill } from '../../../components/ui/status-pill';
import { EmptyState } from '../../../components/ui/empty-state';
import { Pagination } from '../../../components/ui/pagination';
import { Button } from '../../../components/ui/button';
import { NewScanDialog } from '../../../components/new-scan-dialog';
import { CollapsibleCard } from '../../../components/ui/collapsible-card';
import { TargetsManager } from '../../../components/targets-manager';
import { ProjectSwitcher } from '../../../components/project-switcher';
import { getActiveProjectId } from '../../../lib/active-project';
import { tenantScope, scopeWhere, scopeWhereOrGlobal } from '../../../lib/tenancy';
import { scans, targets, scanProfiles, projects } from '@vacti/db';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import { getLocale } from '../../../lib/locale';
import { tx, type Locale } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

function rel(d: Date, locale: Locale): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const ago = (v: string) => (locale === 'id' ? `${v} lalu` : `${v} ago`);
  if (s < 60) return ago(`${s}s`);
  if (s < 3600) return ago(`${Math.floor(s / 60)}m`);
  if (s < 86400) return ago(`${Math.floor(s / 3600)}h`);
  return ago(`${Math.floor(s / 86400)}d`);
}

const PAGE_SIZE = 25;

// Reports are generated from finished scans only; running scans would produce partial documents.
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; project?: string; tpage?: string; ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const db = getDb();
  const t = await tenantScope(user);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const tpage = Math.max(1, Number(sp.tpage ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const projectRows = await db
    .select()
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));
  const projectId = await getActiveProjectId(sp.project, projectRows);
  // Scope scans + targets to the active project (multi-project workspaces).
  // Scans dashboard is for VA scans only (active/full). Passive-recon-only scans belong to Attack
  // Surface and are excluded here.
  const scanWhere = and(
    ne(scans.mode, 'passive'),
    projectId ? eq(scans.projectId, projectId) : undefined,
    scopeWhere(t, scans.projectId),
  );
  const [scanRows, targetRows, profileRows, countRows] = await Promise.all([
    db.select().from(scans).where(scanWhere).orderBy(desc(scans.createdAt)).limit(PAGE_SIZE).offset(offset),
    projectId
      ? db.select().from(targets).where(eq(targets.projectId, projectId)).orderBy(desc(targets.createdAt))
      : Promise.resolve([]),
    db.select().from(scanProfiles).where(scopeWhereOrGlobal(t, scanProfiles.projectId)),
    db.select({ n: count() }).from(scans).where(scanWhere),
  ]);
  const totalScans = Number(countRows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalScans / PAGE_SIZE));
  const targetById = new Map(targetRows.map((t) => [t.id, t]));
  return (
    <>
      <PageHeader
        title="Vulnerability Assessment"
        description={tx(locale, 'Recon runs across your targets.', 'Proses recon pada target Anda.')}
        actions={
          <div className="flex items-center gap-2">
            <ProjectSwitcher projects={projectRows} current={projectId} basePath="/scans" />
            <NewScanDialog
              targets={targetRows.map((t) => ({ id: t.id, domain: t.domain }))}
              profiles={profileRows.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        }
      />
      <div className="mb-6">
        <CollapsibleCard
          title={`${tx(locale, 'Targets', 'Target')} · ${targetRows.length}`}
          defaultOpen={targetRows.length === 0}
        >
          <TargetsManager
            user={user}
            locale={locale}
            projectId={projectId}
            projectRows={projectRows}
            basePath="/scans"
            page={tpage}
            ok={sp.ok}
            error={sp.error}
          />
        </CollapsibleCard>
      </div>
      {scanRows.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title={tx(locale, 'No scans yet', 'Belum ada scan')}
          description={tx(
            locale,
            'Add a target in the Targets panel above, then start your first recon scan.',
            'Tambahkan target di panel Target di atas, lalu mulai scan recon pertama Anda.',
          )}
        />
      ) : (
        <div data-testid="scan-list">
          <Table>
            <THead>
              <TR>
                <TH>Target</TH>
                <TH>{tx(locale, 'Status', 'Status')}</TH>
                <TH>{tx(locale, 'Findings', 'Temuan')}</TH>
                <TH>{tx(locale, 'Started', 'Dimulai')}</TH>
                <TH>{tx(locale, 'Report', 'Laporan')}</TH>
              </TR>
            </THead>
            <TBody>
              {scanRows.map((s) => {
                const c = (s.counts ?? {}) as Record<string, number>;
                return (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/scans/${s.id}`} className="font-mono text-sm text-accent hover:underline">
                        {targetById.get(s.targetId)?.domain ?? s.targetId.slice(0, 8)}
                      </Link>
                    </TD>
                    <TD>
                      <span data-testid={`scan-status-${s.id}`}>
                        <StatusPill status={s.status} />
                      </span>
                    </TD>
                    <TD className="tabular text-sm text-fg-muted">
                      {c.endpoints ?? 0} endpoints · {c.ports ?? 0} ports · {c.vulnerabilities ?? 0} vulns
                    </TD>
                    <TD className="text-sm text-fg-subtle">{rel(s.createdAt, locale)}</TD>
                    <TD>
                      {/* VA reports, surfaced here now that the standalone Reports hub is retired. Full
                          includes recon and findings; Recon and Findings are scoped variants. */}
                      {TERMINAL.has(s.status) ? (
                        <div className="flex items-center gap-1">
                          <Button asChild variant="outline" size="sm">
                            <a href={`/reports/va/${s.id}?type=full`} target="_blank" rel="noopener noreferrer">
                              Full
                            </a>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/reports/va/${s.id}?type=recon`} target="_blank" rel="noopener noreferrer">
                              {tx(locale, 'Recon', 'Recon')}
                            </a>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/reports/va/${s.id}?type=vuln`} target="_blank" rel="noopener noreferrer">
                              {tx(locale, 'Findings', 'Temuan')}
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-fg-subtle">-</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={totalScans}
            label={tx(locale, 'scans', 'scan')}
            makeHref={(p) => `/scans?project=${projectId}&page=${p}`}
          />
        </div>
      )}
    </>
  );
}
