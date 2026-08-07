import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDb,
  runMigrations,
  projects,
  targets,
  scans,
  vulnerabilities,
  threatIntelStatus,
  otxThreatData,
  brandNews,
  type Database,
} from '@vacti/db';
import { refreshThreatIntel, pruneOldNews, capNews, NEWS_CAP } from './refresh';
import { computeProjectRisk } from './risk-aggregate';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('threat-intel integration', () => {
  let handle: { db: Database; close: () => Promise<void> };
  beforeAll(async () => {
    await runMigrations(url!);
    handle = createDb(url!);
  });
  afterAll(() => handle?.close());

  it('refresh completes gracefully without API keys, and risk reflects VA', async () => {
    const db = handle.db;
    const [p] = await db
      .insert(projects)
      .values({ slug: `ti${Date.now()}`, name: 'TI' })
      .returning();
    const [t] = await db.insert(targets).values({ projectId: p!.id, domain: 'example.com' }).returning();
    const [s] = await db.insert(scans).values({ projectId: p!.id, targetId: t!.id, status: 'completed' }).returning();
    await db.insert(vulnerabilities).values({ scanId: s!.id, templateId: 'x', name: 'Critical finding', severity: 4 });

    await refreshThreatIntel({ db, projectId: p!.id }); // no keys → graceful no-op data

    const [st] = await db.select().from(threatIntelStatus).where(eq(threatIntelStatus.projectId, p!.id));
    expect(st!.state).toBe('completed');
    const otx = await db.select().from(otxThreatData).where(eq(otxThreatData.projectId, p!.id));
    expect(otx).toEqual([]);

    const risk = await computeProjectRisk(db, p!.id);
    expect(risk.score).toBeGreaterThan(0);
    expect(['yellow', 'red', 'green']).toContain(risk.color);
  }, 30000);

  it('pruneOldNews drops stale brand news but keeps recent + analyst-flagged', async () => {
    const db = handle.db;
    const [p] = await db
      .insert(projects)
      .values({ slug: `prune${Date.now()}`, name: 'Prune' })
      .returning();
    const old = new Date(Date.now() - 120 * 24 * 3600 * 1000); // 120 days ago
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000); // 5 days ago
    await db.insert(brandNews).values([
      { projectId: p!.id, title: 'old', link: 'l-old', source: 's', publishedAt: old, status: 'new' },
      { projectId: p!.id, title: 'old-flagged', link: 'l-flagged', source: 's', publishedAt: old, status: 'relevant' },
      { projectId: p!.id, title: 'recent', link: 'l-recent', source: 's', publishedAt: recent, status: 'new' },
    ]);

    await pruneOldNews(db, 90, { projectId: p!.id });

    const rows = await db.select().from(brandNews).where(eq(brandNews.projectId, p!.id));
    const links = rows.map((r) => r.link).sort();
    expect(links).toEqual(['l-flagged', 'l-recent']); // old 'new' pruned; flagged + recent kept
  }, 30000);

  it('capNews keeps only the newest NEWS_CAP brand rows', async () => {
    const db = handle.db;
    const [p] = await db
      .insert(projects)
      .values({ slug: `cap${Date.now()}`, name: 'Cap' })
      .returning();
    // Insert 20 rows with increasing publishedAt; only the newest NEWS_CAP (15) should survive.
    const base = Date.now() - 40 * 24 * 3600 * 1000;
    await db.insert(brandNews).values(
      Array.from({ length: 20 }, (_, i) => ({
        projectId: p!.id,
        title: `n${i}`,
        link: `cap-${i}`,
        source: 's',
        publishedAt: new Date(base + i * 3600 * 1000),
        status: 'new',
      })),
    );
    await capNews(db, NEWS_CAP, { projectId: p!.id });
    const rows = await db.select().from(brandNews).where(eq(brandNews.projectId, p!.id));
    expect(rows).toHaveLength(NEWS_CAP);
    // The survivors are the newest 15 (cap-5 .. cap-19); cap-0 (oldest) is gone.
    const links = new Set(rows.map((r) => r.link));
    expect(links.has('cap-19')).toBe(true);
    expect(links.has('cap-0')).toBe(false);
  }, 30000);
});
