import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft, Workflow } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import { ZoomPan } from '../../../../../components/ui/zoom-pan';
import { scans, targets, vulnerabilities } from '@vacti/db';
import { SEVERITY_LABEL, type SeverityValue } from '@vacti/core';
import { getDb } from '../../../../../lib/db';
import { getCurrentUser } from '../../../../../lib/session';
import { requireProjectMember } from '../../../../../lib/tenancy';
import { getLocale } from '../../../../../lib/locale';
import { tx } from '../../../../../lib/i18n';
import { type Phase, inferPhaseVa, phaseLabel, severityName, SEVERITY_COLOR } from './phases-va';

export const dynamic = 'force-dynamic';

const PHASES: Phase[] = ['recon', 'initial_access', 'privilege_escalation', 'lateral_movement', 'impact'];
const phaseIndex = (p: Phase): number => PHASES.indexOf(p);

// Severity ordering used everywhere (highest first), matching the int scale 4..0.
const SEVERITY_ORDER = [4, 3, 2, 1, 0] as const;
const severityColorFor = (sev: number): string => SEVERITY_COLOR[severityName(sev)] ?? '#6b7280';

// Cap the kill-chain nodes so the SVG stays bounded and readable; a note is shown if more were in scope.
const MAX_NODES = 40;

// --- SVG geometry (viewBox units). ---
const COL_W = 240; // phase column width
const LANE_LABEL_W = 150; // left gutter for host names
const HEADER_H = 64; // space for the phase header row
const NODE_W = 204;
const NODE_H = 40;
const NODE_VGAP = 12; // vertical gap when stacking findings in the same cell
const LANE_PAD = 16; // vertical padding inside a lane
const NODE_X_PAD = (COL_W - NODE_W) / 2; // center node in its column

type VulnRow = {
  id: string;
  name: string;
  severity: number;
  host: string | null;
  url: string | null;
  matchedAt: string | null;
  templateId: string;
  tags: string[];
  cveIds: string[];
};

type Node = { id: string; label: string; severity: number; phase: Phase; x: number; y: number };

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

/** Extract a host from a url when host is null. Returns null if not parseable. */
function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export default async function VaAttackPathPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const db = getDb();
  const locale = await getLocale();

  const [scan] = await db.select().from(scans).where(eq(scans.id, id));
  if (!scan) notFound();
  await requireProjectMember(user, scan.projectId);
  const [target] = await db.select().from(targets).where(eq(targets.id, scan.targetId));

  // One query: all of this scan's findings. In-scope = exclude false positives (same filter the scan
  // detail page treats as not-shipped); everything else is mapped onto the kill-chain.
  const allRows = await db.select().from(vulnerabilities).where(eq(vulnerabilities.scanId, id));
  const rows: VulnRow[] = allRows
    .filter((v) => v.status !== 'false_positive')
    .map((v) => ({
      id: v.id,
      name: v.name,
      severity: v.severity,
      host: v.host,
      url: v.url,
      matchedAt: v.matchedAt,
      templateId: v.templateId,
      tags: v.tags ?? [],
      cveIds: v.cveIds ?? [],
    }));

  const targetName = target?.domain ?? scan.targetId.slice(0, 8);
  const back = (
    <Button variant="ghost" asChild>
      <Link href={`/scans/${scan.id}?tab=vulns`}>
        <ArrowLeft className="size-4" /> {tx(locale, 'Back to scan', 'Kembali ke scan')}
      </Link>
    </Button>
  );

  // --- Header card: per-severity counts over the in-scope set. ---
  const sevCounts = SEVERITY_ORDER.map((s) => ({ sev: s, n: rows.filter((r) => r.severity === s).length }));

  const header = (
    <div className="mb-6">
      <Link
        href={`/scans/${scan.id}?tab=vulns`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {tx(locale, 'Back to scan', 'Kembali ke scan')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{targetName}</h1>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{tx(locale, 'Attack Path', 'Jalur Serangan')}</p>
    </div>
  );

  const headerCard = (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="size-4 text-accent" /> {tx(locale, 'Overview', 'Ringkasan')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <div className="text-lg font-semibold text-fg">{rows.length}</div>
            <div className="mt-0.5 text-[11px] text-fg-muted">{tx(locale, 'In-scope findings', 'Temuan in-scope')}</div>
          </div>
          {sevCounts.map(({ sev, n }) => (
            <div key={sev} className="rounded-md border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block size-3 rounded-sm"
                  style={{ backgroundColor: severityColorFor(sev) }}
                  aria-hidden
                />
                <span className="text-lg font-semibold text-fg">{n}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-fg-muted">{SEVERITY_LABEL[sev as SeverityValue]}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  // --- Empty state. ---
  if (rows.length === 0) {
    return (
      <>
        {header}
        {headerCard}
        <Card>
          <CardContent className="py-10 text-center">
            <Workflow className="mx-auto size-6 text-fg-subtle" />
            <p className="mt-3 text-sm font-medium text-fg">
              {tx(locale, 'No attack path yet', 'Belum ada jalur serangan')}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {tx(
                locale,
                'This scan has no in-scope findings to map onto the kill chain.',
                'Scan ini tidak memiliki temuan in-scope untuk dipetakan ke kill chain.',
              )}
            </p>
            <div className="mt-4 flex justify-center">{back}</div>
          </CardContent>
        </Card>
      </>
    );
  }

  // Keep the highest-severity findings when over the cap.
  const truncated = rows.length > MAX_NODES;
  const capped = truncated ? [...rows].sort((a, b) => b.severity - a.severity).slice(0, MAX_NODES) : rows;

  // --- Group findings into host lanes; within a lane, place each finding in its inferred phase column. ---
  const laneOf = (r: VulnRow) => r.host ?? hostFromUrl(r.url) ?? tx(locale, 'target', 'target');

  const lanesMap = new Map<string, VulnRow[]>();
  for (const r of capped) {
    const key = laneOf(r);
    const list = lanesMap.get(key) ?? [];
    list.push(r);
    lanesMap.set(key, list);
  }

  // Build node positions + per-lane height. Stack vertically when a cell holds multiple findings.
  const lanes: Array<{ host: string; nodes: Node[]; height: number; topY: number }> = [];
  let cursorY = HEADER_H;

  for (const [host, list] of lanesMap) {
    const byPhase = new Map<number, VulnRow[]>();
    for (const r of list) {
      const ci = phaseIndex(inferPhaseVa(r));
      const arr = byPhase.get(ci) ?? [];
      arr.push(r);
      byPhase.set(ci, arr);
    }
    for (const arr of byPhase.values()) arr.sort((a, b) => b.severity - a.severity);

    const maxStack = Math.max(...[...byPhase.values()].map((a) => a.length));
    const laneInnerH = maxStack * NODE_H + (maxStack - 1) * NODE_VGAP;
    const laneHeight = laneInnerH + LANE_PAD * 2;
    const topY = cursorY;

    const nodes: Node[] = [];
    for (const [ci, arr] of byPhase) {
      arr.forEach((r, i) => {
        const x = LANE_LABEL_W + ci * COL_W + NODE_X_PAD;
        const y = topY + LANE_PAD + i * (NODE_H + NODE_VGAP);
        const label = r.cveIds.length ? `${truncate(r.name, 18)} (${r.cveIds[0]})` : r.name;
        nodes.push({ id: r.id, label, severity: r.severity, phase: inferPhaseVa(r), x, y });
      });
    }
    lanes.push({ host, nodes, height: laneHeight, topY });
    cursorY += laneHeight;
  }

  const width = LANE_LABEL_W + PHASES.length * COL_W;
  const height = cursorY + 8;

  // --- Progression edges: connect each lane's finding to the nearest finding of the next OCCUPIED phase. ---
  type Edge = { x1: number; y1: number; x2: number; y2: number };
  const edges: Edge[] = [];
  for (const lane of lanes) {
    const cols = new Map<number, Node[]>();
    for (const n of lane.nodes) {
      const ci = phaseIndex(n.phase);
      const arr = cols.get(ci) ?? [];
      arr.push(n);
      cols.set(ci, arr);
    }
    const present = [...cols.keys()].sort((a, b) => a - b);
    for (let k = 0; k < present.length - 1; k++) {
      const fromCol = present[k];
      const toCol = present[k + 1];
      if (fromCol === undefined || toCol === undefined) continue;
      const from = cols.get(fromCol)?.[0];
      const to = cols.get(toCol)?.[0];
      if (!from || !to) continue;
      edges.push({ x1: from.x + NODE_W, y1: from.y + NODE_H / 2, x2: to.x, y2: to.y + NODE_H / 2 });
    }
  }

  // --- Findings map: host x severity heatmap. Rows = affected hosts, cols = Critical..Info. ---
  const heatHosts = [...lanesMap.keys()];
  const heat = heatHosts.map((host) => {
    const list = lanesMap.get(host) ?? [];
    const cells = SEVERITY_ORDER.map((sev) => ({ sev, n: list.filter((r) => r.severity === sev).length }));
    return { host, total: list.length, cells };
  });
  const maxCell = Math.max(1, ...heat.flatMap((h) => h.cells.map((c) => c.n)));

  return (
    <>
      {header}
      {headerCard}

      {/* Section 2: Kill Chain / Attack Path graph */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="size-4 text-accent" /> {tx(locale, 'Kill Chain', 'Jalur Serangan')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-fg-muted">
            {tx(
              locale,
              'Phases are inferred from each finding’s nuclei tags and laid out left-to-right; findings are grouped by affected host into lanes. Arrows show progression to the next phase reached on the same host.',
              'Fase diinferensi dari tag nuclei tiap temuan dan ditata kiri-ke-kanan; temuan dikelompokkan per host terdampak menjadi lane. Panah menunjukkan progres ke fase berikutnya yang dicapai pada host yang sama.',
            )}
          </p>

          {truncated ? (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
              {tx(
                locale,
                `Showing the ${MAX_NODES} highest-severity of ${rows.length} in-scope findings.`,
                `Menampilkan ${MAX_NODES} temuan dengan severity tertinggi dari ${rows.length} temuan in-scope.`,
              )}
            </p>
          ) : null}

          <ZoomPan locale={locale} height={460}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width="100%"
              role="img"
              aria-label={tx(locale, 'Attack path graph', 'Grafik jalur serangan')}
              className="min-w-[760px]"
            >
              <defs>
                <marker
                  id="va-ap-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                </marker>
              </defs>

              {/* phase column headers + separators */}
              {PHASES.map((p, ci) => {
                const cx = LANE_LABEL_W + ci * COL_W;
                return (
                  <g key={p}>
                    {ci > 0 ? (
                      <line x1={cx} y1={HEADER_H - 12} x2={cx} y2={height - 8} stroke="#e2e8f0" strokeWidth={1} />
                    ) : null}
                    <text
                      x={cx + COL_W / 2}
                      y={HEADER_H / 2}
                      textAnchor="middle"
                      className="fill-fg"
                      fontSize={13}
                      fontWeight={600}
                    >
                      {`${ci + 1}. ${phaseLabel(p, locale)}`}
                    </text>
                  </g>
                );
              })}

              {/* lane backgrounds + host labels */}
              {lanes.map((lane, i) => (
                <g key={lane.host}>
                  {i % 2 === 1 ? <rect x={0} y={lane.topY} width={width} height={lane.height} fill="#f8fafc" /> : null}
                  <line x1={0} y1={lane.topY} x2={width} y2={lane.topY} stroke="#e2e8f0" strokeWidth={1} />
                  <text
                    x={10}
                    y={lane.topY + lane.height / 2}
                    dominantBaseline="middle"
                    className="fill-fg-muted"
                    fontSize={11}
                  >
                    {truncate(lane.host, 22)}
                  </text>
                </g>
              ))}

              {/* edges (drawn under nodes) */}
              {edges.map((e, i) => (
                <line
                  key={i}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  markerEnd="url(#va-ap-arrow)"
                />
              ))}

              {/* nodes */}
              {lanes.flatMap((lane) =>
                lane.nodes.map((n) => (
                  <g key={n.id}>
                    <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={7} fill={severityColorFor(n.severity)} />
                    <text
                      x={n.x + 10}
                      y={n.y + NODE_H / 2}
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight={500}
                    >
                      {truncate(n.label, 26)}
                    </text>
                  </g>
                )),
              )}
            </svg>
          </ZoomPan>

          {/* legend */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-fg-muted">{tx(locale, 'Phases', 'Fase')}:</span>
              {PHASES.map((p, ci) => (
                <span key={p} className="text-fg-muted">
                  {ci + 1}. {phaseLabel(p, locale)}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-fg-muted">Severity:</span>
              {SEVERITY_ORDER.map((sev) => (
                <span key={sev} className="flex items-center gap-1.5 text-fg-muted">
                  <span
                    className="inline-block size-3 rounded-sm"
                    style={{ backgroundColor: severityColorFor(sev) }}
                    aria-hidden
                  />
                  {SEVERITY_LABEL[sev as SeverityValue]}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Findings Map (host x severity heatmap) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{tx(locale, 'Findings Map', 'Peta Temuan')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-fg-muted">
            {tx(
              locale,
              'Each cell counts a host’s findings at that severity; the shade deepens with the count.',
              'Tiap sel menghitung temuan suatu host pada severity tersebut; warna makin pekat seiring jumlahnya.',
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-fg-muted">
                    {tx(locale, 'Host', 'Host')}
                  </th>
                  {SEVERITY_ORDER.map((sev) => (
                    <th key={sev} className="px-2 py-1.5 text-center text-xs font-medium text-fg-muted">
                      {SEVERITY_LABEL[sev as SeverityValue]}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-fg-muted">
                    {tx(locale, 'Total', 'Total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {heat.map((h) => (
                  <tr key={h.host} className="border-t border-border">
                    <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-xs text-fg-muted" title={h.host}>
                      {h.host}
                    </td>
                    {h.cells.map((c) => {
                      const intensity = c.n === 0 ? 0 : 0.18 + 0.62 * (c.n / maxCell);
                      return (
                        <td key={c.sev} className="px-1 py-1 text-center">
                          <div
                            className="mx-auto flex h-8 w-12 items-center justify-center rounded-md text-xs font-semibold"
                            style={{
                              backgroundColor: c.n === 0 ? 'transparent' : severityColorFor(c.sev),
                              opacity: c.n === 0 ? 1 : intensity,
                              color: c.n === 0 ? 'var(--fg-subtle, #94a3b8)' : '#ffffff',
                            }}
                          >
                            {c.n === 0 ? '·' : c.n}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center text-xs font-semibold text-fg">{h.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
