import Link from 'next/link';
import Form from 'next/form';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, ne } from 'drizzle-orm';
import { diffScans } from '@vacti/recon';
import { ArrowLeft, Globe, Network, Server, ShieldAlert } from 'lucide-react';
import { StatusPill } from '../../../../components/ui/status-pill';
import { StageStepper, type StageState } from '../../../../components/ui/stage-stepper';
import { Timeline } from '../../../../components/ui/timeline';
import { Card, CardContent } from '../../../../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../../components/ui/tabs';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../../components/ui/action-form';
import { Select } from '../../../../components/ui/select';
import { userCan, Permission } from '@vacti/core';
import { scans, targets, scanActivity, subdomains, endpoints, ports as portsTable, vulnerabilities } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { cancelScanAction, deleteScanAction } from '../../../../lib/recon-actions';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';
import AutoRefresh from './auto-refresh';
import { VulnTable } from './vuln-table';
import { RescanForm } from './rescan-form';

export const dynamic = 'force-dynamic';
const TERMINAL = ['completed', 'failed', 'cancelled'];
const STAGES = ['subfinder', 'httpx', 'naabu', 'nuclei', 'wordfence'];

export default async function ScanDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compare?: string; tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const { id } = await params;
  const { compare, tab = 'endpoints' } = await searchParams;
  const db = getDb();
  const [scan] = await db.select().from(scans).where(eq(scans.id, id));
  if (!scan) notFound();
  await requireProjectMember(user, scan.projectId);
  const [target] = await db.select().from(targets).where(eq(targets.id, scan.targetId));
  const [activity, subs, eps, prt, vulns] = await Promise.all([
    db.select().from(scanActivity).where(eq(scanActivity.scanId, id)).orderBy(scanActivity.createdAt),
    db.select().from(subdomains).where(eq(subdomains.scanId, id)),
    db.select().from(endpoints).where(eq(endpoints.scanId, id)),
    db.select().from(portsTable).where(eq(portsTable.scanId, id)),
    db.select().from(vulnerabilities).where(eq(vulnerabilities.scanId, id)),
  ]);
  const terminal = TERMINAL.includes(scan.status);
  const canScan = userCan(user, Permission.InitiateScans);
  const canTriage = userCan(user, Permission.ModifyScanResults);

  // Sibling scans of the same target (for the compare dropdown) + optional diff. Only COMPLETED
  // non-passive baselines: a passive scan has no endpoint/port/vuln rows and a failed/running one
  // is partial, so diffing against either fabricates "+added/-removed" results.
  const siblings = (
    await db
      .select()
      .from(scans)
      .where(and(eq(scans.targetId, scan.targetId), eq(scans.status, 'completed'), ne(scans.mode, 'passive')))
      .orderBy(desc(scans.createdAt))
  ).filter((s) => s.id !== id);
  const keysOf = (
    sd: { host: string }[],
    ep: { url: string }[],
    pt: { ip: string; port: number }[],
    vl: { templateId: string; matchedAt: string | null; url: string | null }[],
  ) => ({
    subdomains: sd.map((s) => s.host),
    endpoints: ep.map((e) => e.url),
    ports: pt.map((p) => `${p.ip}:${p.port}`),
    vulns: vl.map((v) => `${v.templateId}@${v.matchedAt ?? v.url ?? ''}`),
  });
  let diff: ReturnType<typeof diffScans> | null = null;
  if (compare && siblings.some((s) => s.id === compare)) {
    const [bsub, bep, bpt, bvl] = await Promise.all([
      db.select().from(subdomains).where(eq(subdomains.scanId, compare)),
      db.select().from(endpoints).where(eq(endpoints.scanId, compare)),
      db.select().from(portsTable).where(eq(portsTable.scanId, compare)),
      db.select().from(vulnerabilities).where(eq(vulnerabilities.scanId, compare)),
    ]);
    diff = diffScans(keysOf(bsub, bep, bpt, bvl), keysOf(subs, eps, prt, vulns));
  }

  const stageState = (name: string): StageState => {
    const acts = activity.filter((a) => a.stage === name);
    const last = acts[acts.length - 1];
    if (!last) return 'pending';
    if (last.status === 'completed') return 'completed';
    if (last.status === 'skipped') return 'skipped';
    if (last.status === 'failed') return 'failed';
    return 'running';
  };
  const stages = STAGES.map((s) => ({ label: s, state: stageState(s) }));

  return (
    <>
      <AutoRefresh terminal={terminal} />
      <div className="mb-6">
        <Link href="/scans" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {tx(locale, 'Scans', 'Scan')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {target?.domain ?? scan.targetId.slice(0, 8)}
            </h1>
            <span data-testid="scan-status">
              <StatusPill status={scan.status} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!terminal && userCan(user, Permission.InitiateScans) ? (
              <ActionForm action={cancelScanAction}>
                <input type="hidden" name="id" value={scan.id} />
                <ActionSubmit
                  variant="outline"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  pendingText={tx(locale, 'Cancelling...', 'Membatalkan...')}
                >
                  {tx(locale, 'Cancel scan', 'Batalkan scan')}
                </ActionSubmit>
              </ActionForm>
            ) : null}
            {scan.mode === 'passive' ? (
              // A passive scan has no VA results: a VA PDF for it would document an assessment
              // that never ran. Its output lives on the Attack Surface page instead.
              <Button asChild variant="secondary" size="sm">
                <Link href="/surface">{tx(locale, 'View on Attack Surface', 'Lihat di Attack Surface')}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/scans/${scan.id}/attack-path`}>{tx(locale, 'Attack Path', 'Jalur Serangan')}</Link>
                </Button>
                <Button asChild size="sm">
                  <a href={`/reports/va/${scan.id}?type=full`} target="_blank" rel="noopener noreferrer">
                    {tx(locale, 'Generate report', 'Buat laporan')}
                  </a>
                </Button>
              </>
            )}
            {terminal && userCan(user, Permission.InitiateScans) ? (
              // ActionForm (not a bare server-action form): on this heavy page the action's redirect
              // response is dropped, so ActionForm awaits then navigates to /scans itself.
              <ActionForm
                action={deleteScanAction}
                redirectTo="/scans"
                confirm={tx(
                  locale,
                  'Delete this scan and all its results? This cannot be undone.',
                  'Hapus scan ini beserta seluruh hasilnya? Tindakan ini tidak dapat dibatalkan.',
                )}
              >
                <input type="hidden" name="id" value={scan.id} />
                <ActionSubmit
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger/10"
                  pendingText={tx(locale, 'Deleting...', 'Menghapus...')}
                >
                  {tx(locale, 'Delete scan', 'Hapus scan')}
                </ActionSubmit>
              </ActionForm>
            ) : null}
          </div>
        </div>
        {scan.error ? <p className="mt-2 text-sm text-danger">Error: {scan.error}</p> : null}
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-4 pt-5">
          <StageStepper stages={stages} />
          <Timeline items={activity.map((a) => ({ stage: a.stage, status: a.status, message: a.message }))} />
        </CardContent>
      </Card>

      {terminal && (siblings.length > 0 || canScan) ? (
        <Card className="mb-6">
          <CardContent className="space-y-4 pt-5">
            {siblings.length > 0 ? (
              <Form action={`/scans/${id}`} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-fg-subtle">
                    {tx(locale, 'Compare with an earlier scan', 'Bandingkan dengan scan sebelumnya')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select name="compare" defaultValue={compare ?? ''} className="w-72">
                      <option value="">{tx(locale, 'Select a scan…', 'Pilih scan…')}</option>
                      {siblings.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ')} · {s.status}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="outline" size="sm">
                      {tx(locale, 'Compare', 'Bandingkan')}
                    </Button>
                  </div>
                </div>
              </Form>
            ) : null}

            {diff ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ['Subdomains', diff.subdomains],
                    ['Endpoints', diff.endpoints],
                    ['Ports', diff.ports],
                    ['Vulnerabilities', diff.vulns],
                  ] as const
                ).map(([label, d]) => (
                  <div key={label} className="rounded-lg border border-border p-3">
                    <div className="text-xs font-medium text-fg-subtle">{label}</div>
                    <div className="mt-1 flex gap-3 text-sm">
                      <span className="text-success">+{d.added.length}</span>
                      <span className="text-danger">-{d.removed.length}</span>
                      <span className="text-fg-muted">={d.unchanged}</span>
                    </div>
                    {d.added.length ? (
                      <div className="mt-1 truncate font-mono text-[11px] text-success" title={d.added.join('\n')}>
                        {tx(locale, 'new', 'baru')}: {d.added.slice(0, 3).join(', ')}
                        {d.added.length > 3 ? ` +${d.added.length - 3}` : ''}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {canScan ? <RescanForm scanId={scan.id} passive={scan.mode === 'passive'} locale={locale} /> : null}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="endpoints">
            <Globe className="size-3.5" /> Endpoints{' '}
            <Badge variant="neutral" className="ml-1">
              {eps.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="ports">
            <Network className="size-3.5" /> Ports{' '}
            <Badge variant="neutral" className="ml-1">
              {prt.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="subdomains">
            <Server className="size-3.5" /> Subdomains{' '}
            <Badge variant="neutral" className="ml-1">
              {subs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="vulns">
            <ShieldAlert className="size-3.5" /> Vulnerabilities{' '}
            <Badge variant="neutral" className="ml-1">
              {vulns.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="mt-4">
          <Table>
            <THead>
              <TR>
                <TH>URL</TH>
                <TH>{tx(locale, 'Status', 'Status')}</TH>
                <TH>{tx(locale, 'Title', 'Judul')}</TH>
                <TH>Tech</TH>
              </TR>
            </THead>
            <TBody>
              {eps.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.url}</TD>
                  <TD className="tabular">{e.statusCode}</TD>
                  <TD className="max-w-xs truncate text-fg-muted">{e.title}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {e.isInteresting ? <Badge variant="danger">{tx(locale, 'interesting', 'menarik')}</Badge> : null}
                      {e.isWordpress ? <Badge variant="accent">WordPress</Badge> : null}
                      {e.tech.slice(0, 3).map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TabsContent>

        <TabsContent value="ports" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {prt.length ? (
              prt.map((p) => (
                <Badge key={p.id} variant="neutral" className="font-mono">
                  {p.ip}:{p.port}/{p.protocol}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-fg-subtle">{tx(locale, 'No open ports found.', 'Tidak ada port terbuka.')}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="subdomains" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {subs.length ? (
              subs.map((s) => (
                <Badge key={s.id} variant="neutral" className="font-mono">
                  {s.host}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-fg-subtle">
                {tx(
                  locale,
                  'No subdomains (predefined or none discovered).',
                  'Tidak ada subdomain (sudah ditentukan atau tidak ditemukan).',
                )}
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="vulns" className="mt-4">
          {vulns.length ? (
            <VulnTable
              scanId={scan.id}
              canTriage={canTriage}
              locale={locale}
              vulns={vulns.map((v) => ({
                id: v.id,
                name: v.name,
                matchedAt: v.matchedAt,
                severity: v.severity,
                status: v.status,
                description: v.description,
                remediation: v.remediation,
                cvss: v.cvss,
                cveIds: v.cveIds ?? [],
                references: v.references ?? [],
                isAiEnriched: v.isAiEnriched,
                aiDescription: v.aiDescription,
                aiImpact: v.aiImpact,
                aiRemediation: v.aiRemediation,
                request: v.request,
                response: v.response,
                analystNote: v.analystNote,
              }))}
            />
          ) : (
            <p className="text-sm text-fg-subtle">
              {tx(locale, 'No vulnerabilities found.', 'Tidak ada vulnerability ditemukan.')}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
