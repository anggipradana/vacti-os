import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import {
  createDb,
  runMigrations,
  projects,
  targets,
  scans,
  endpoints,
  ports as portsTable,
  scanActivity,
  type Database,
} from '@vacti/db';
import { runScanPipeline } from './pipeline';

const url = process.env.DATABASE_URL;
const haveTools = spawnSync('which', ['httpx']).status === 0 && spawnSync('which', ['naabu']).status === 0;

describe.skipIf(!url || !haveTools)('recon pipeline against localhost', () => {
  let handle: { db: Database; close: () => Promise<void> };
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    await runMigrations(url!);
    handle = createDb(url!);
    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><head><title>vacti pipeline test</title></head><body>ok</body></html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await handle?.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('skips subfinder, probes with httpx, scans ports, completes & persists', async () => {
    const db = handle.db;
    const [proj] = await db
      .insert(projects)
      .values({ slug: `p${Date.now()}`, name: 'Pipeline' })
      .returning();
    const [tgt] = await db
      .insert(targets)
      .values({ projectId: proj!.id, domain: '127.0.0.1', predefinedSubdomains: [`127.0.0.1:${port}`] })
      .returning();
    const [scan] = await db.insert(scans).values({ projectId: proj!.id, targetId: tgt!.id }).returning();

    await runScanPipeline(
      {
        scanId: scan!.id,
        domain: '127.0.0.1',
        predefinedSubdomains: [`127.0.0.1:${port}`],
        profile: {
          tools: { subfinder: false, httpx: true, naabu: true, nuclei: false, wordfence: false },
          ports: String(port),
          severities: ['info'],
          timeoutSec: 60,
        },
      },
      { db },
    );

    const [s] = await db.select().from(scans).where(eq(scans.id, scan!.id));
    expect(s!.status).toBe('completed');

    const eps = await db.select().from(endpoints).where(eq(endpoints.scanId, scan!.id));
    expect(eps.length).toBeGreaterThan(0);
    expect(eps[0]!.statusCode).toBe(200);

    const ps = await db.select().from(portsTable).where(eq(portsTable.scanId, scan!.id));
    expect(ps.map((p) => p.port)).toContain(port);

    const acts = await db.select().from(scanActivity).where(eq(scanActivity.scanId, scan!.id));
    expect(acts.some((a) => a.stage === 'subfinder' && a.status === 'skipped')).toBe(true);
    expect(acts.some((a) => a.stage === 'done' && a.status === 'completed')).toBe(true);
  }, 90_000);
});
