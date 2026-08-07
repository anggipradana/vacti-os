import { ilike, or, desc, and, inArray, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { projects } from './schema';
import { targets, scans, subdomains, endpoints, vulnerabilities } from './recon-schema';

export interface SearchHit {
  kind: 'project' | 'target' | 'scan' | 'subdomain' | 'endpoint' | 'vulnerability';
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
}

/**
 * Universal search across the main resources (case-insensitive substring), capped per category.
 *
 * TENANCY: pass `opts.projectIds` to confine results to the caller's member projects (project-scoped
 * tenant isolation). `undefined`/`null` = unrestricted (SysAdmin sees everything); an EMPTY array = member
 * of nothing = zero hits (fail closed). Categories reached only via a scan (subdomain/endpoint/vuln) are
 * filtered by `scan_id IN (member-project scans)`.
 */
export async function searchAll(
  db: Database,
  query: string,
  opts: { projectIds?: string[] | null; perCategory?: number } = {},
): Promise<SearchResults> {
  const { projectIds, perCategory = 10 } = opts;
  const q = query.trim();
  if (!q) return { query: q, hits: [] };
  // Scoped but member of nothing -> no hits at all.
  if (projectIds && projectIds.length === 0) return { query: q, hits: [] };
  const like = `%${q}%`;
  const scoped = Array.isArray(projectIds); // false => SysAdmin / unrestricted
  // Sub-select of scan ids in the caller's projects, for the scan-derived categories.
  const memberScanIds = scoped
    ? db.select({ id: scans.id }).from(scans).where(inArray(scans.projectId, projectIds!))
    : null;
  const withScope = (base: SQL | undefined, extra: SQL | undefined): SQL | undefined =>
    extra ? (base ? and(base, extra) : extra) : base;
  const [proj, tgt, sub, ep, vuln] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(
        withScope(
          or(ilike(projects.name, like), ilike(projects.slug, like)),
          scoped ? inArray(projects.id, projectIds!) : undefined,
        ),
      )
      .limit(perCategory),
    db
      .select()
      .from(targets)
      .where(withScope(ilike(targets.domain, like), scoped ? inArray(targets.projectId, projectIds!) : undefined))
      .limit(perCategory),
    db
      .select()
      .from(subdomains)
      .where(
        withScope(ilike(subdomains.host, like), memberScanIds ? inArray(subdomains.scanId, memberScanIds) : undefined),
      )
      .limit(perCategory),
    db
      .select()
      .from(endpoints)
      .where(
        withScope(
          or(ilike(endpoints.url, like), ilike(endpoints.title, like)),
          memberScanIds ? inArray(endpoints.scanId, memberScanIds) : undefined,
        ),
      )
      .limit(perCategory),
    db
      .select()
      .from(vulnerabilities)
      .where(
        withScope(
          ilike(vulnerabilities.name, like),
          memberScanIds ? inArray(vulnerabilities.scanId, memberScanIds) : undefined,
        ),
      )
      .orderBy(desc(vulnerabilities.severity))
      .limit(perCategory),
  ]);
  const hits: SearchHit[] = [
    ...proj.map((p) => ({ kind: 'project' as const, id: p.id, label: p.name, sublabel: p.slug, href: `/projects` })),
    ...tgt.map((t) => ({ kind: 'target' as const, id: t.id, label: t.domain, href: `/targets/${t.id}` })),
    ...sub.map((s) => ({ kind: 'subdomain' as const, id: s.id, label: s.host, href: `/scans/${s.scanId}` })),
    ...ep.map((e) => ({
      kind: 'endpoint' as const,
      id: e.id,
      label: e.url,
      sublabel: e.title ?? undefined,
      href: `/scans/${e.scanId}`,
    })),
    ...vuln.map((v) => ({
      kind: 'vulnerability' as const,
      id: v.id,
      label: v.name,
      sublabel: v.url ?? v.matchedAt ?? undefined,
      href: `/scans/${v.scanId}`,
    })),
  ];
  return { query: q, hits };
}
