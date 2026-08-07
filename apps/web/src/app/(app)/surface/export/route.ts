import { desc, eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { discoveredUrls, exposureFindings, ipResolutions } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { makeZip, toCsv } from '../../../../lib/zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export attack-surface data for a project as CSV (one resource) or a ZIP bundle (all three).
 * `?project=<id>&format=csv|zip&resource=urls|findings|ips`. Restricted to operator roles: the
 * findings CSV carries exposure snippets (confidential, credential-like) unmasked.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!userCan(user, Permission.ModifyScanResults)) return new Response('Forbidden', { status: 403 });
  const url = new URL(req.url);
  const projectId = url.searchParams.get('project');
  if (!projectId) return new Response('project required', { status: 400 });
  // Tenancy: only a member of this project (or SysAdmin) may export its attack-surface data.
  await requireProjectMember(user, projectId);
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'zip';
  const resource = url.searchParams.get('resource') ?? 'urls';
  const db = getDb();

  const urlRows = async () =>
    (
      await db
        .select()
        .from(discoveredUrls)
        .where(eq(discoveredUrls.projectId, projectId))
        .orderBy(desc(discoveredUrls.createdAt))
    ).map((u) => ({
      url: u.urlText,
      host: u.host,
      category: u.categorySlug,
      extension: u.pathnameExtension,
      sources: (u.sources ?? []).join('|'),
      deep_scan: u.deepScanState,
      http_status: u.httpStatus,
      external_seen_at: u.externalSeenAt?.toISOString() ?? '',
    }));
  const findingRows = async () =>
    (
      await db
        .select()
        .from(exposureFindings)
        .where(eq(exposureFindings.projectId, projectId))
        .orderBy(desc(exposureFindings.createdAt))
    ).map((f) => ({
      type: f.findingType,
      source: f.source,
      status: f.status,
      snippet: f.snippet,
      url: f.urlText,
      created_at: f.createdAt.toISOString(),
    }));
  const ipRows = async () =>
    (
      await db
        .select()
        .from(ipResolutions)
        .where(eq(ipResolutions.projectId, projectId))
        .orderBy(desc(ipResolutions.latestResolvedAt))
    ).map((i) => ({
      ip: i.ipAddress,
      latest_resolved_at: i.latestResolvedAt.toISOString(),
      hostname_count: i.hostnameCount,
    }));

  if (format === 'csv') {
    const map: Record<string, () => Promise<Record<string, unknown>[]>> = {
      urls: urlRows,
      findings: findingRows,
      ips: ipRows,
    };
    const fn = map[resource] ?? urlRows;
    const csv = toCsv(await fn());
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="surface_${resource}.csv"`,
      },
    });
  }

  const [u, f, i] = await Promise.all([urlRows(), findingRows(), ipRows()]);
  const zip = makeZip([
    { name: 'discovered_urls.csv', content: toCsv(u) },
    { name: 'exposure_findings.csv', content: toCsv(f) },
    { name: 'ip_resolutions.csv', content: toCsv(i) },
  ]);
  return new Response(new Uint8Array(zip), {
    headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="attack_surface.zip"' },
  });
}
