import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateApiToken } from '@vacti/auth';
import { createDb, runMigrations, users, apiTokens, projects, type Database } from '@vacti/db';
import { buildApi } from './app';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('@vacti/api', () => {
  let handle: { db: Database; close: () => Promise<void> };
  let app: ReturnType<typeof buildApi>;
  let token = '';
  let projectId = '';
  const enqueued: string[] = [];

  beforeAll(async () => {
    await runMigrations(url!);
    handle = createDb(url!);
    const db = handle.db;
    const [u] = await db
      .insert(users)
      .values({ email: `api${Date.now()}@x.com`, passwordHash: 'x' })
      .returning();
    const t = generateApiToken();
    token = t.plaintext;
    await db.insert(apiTokens).values({ userId: u!.id, label: 'test', tokenHash: t.hash });
    const [p] = await db
      .insert(projects)
      .values({ slug: `api${Date.now()}`, name: 'API' })
      .returning();
    projectId = p!.id;
    app = buildApi({ db, enqueueScan: async (id) => void enqueued.push(id), enqueueTiRefresh: async () => {} });
  });
  afterAll(() => handle?.close());

  const auth = () => ({ Authorization: `Bearer ${token}`, 'content-type': 'application/json' });

  it('exposes a public health endpoint', async () => {
    expect((await app.request('/api/health')).status).toBe(200);
  });

  it('serves a complete OpenAPI doc (public) with auth scheme + key endpoints', async () => {
    const r = await app.request('/api/openapi.json');
    expect(r.status).toBe(200);
    const spec = (await r.json()) as {
      components: { securitySchemes: Record<string, unknown> };
      paths: Record<string, unknown>;
    };
    expect(spec.components.securitySchemes.bearerAuth).toBeTruthy();
    for (const p of ['/api/scans/{id}/cancel', '/api/scans/{id}/diff', '/api/schedules', '/api/search']) {
      expect(spec.paths[p]).toBeTruthy();
    }
    expect((await app.request('/api/docs')).status).toBe(200);
  });

  it('documents EVERY route in OpenAPI (no undocumented endpoint)', async () => {
    const spec = (await (await app.request('/api/openapi.json')).json()) as { paths: Record<string, unknown> };
    const documented = new Set(Object.keys(spec.paths));
    // Every real HTTP route in the app must have a matching OpenAPI path (`:param` → `{param}`).
    const routePaths = [
      ...new Set(
        (app.routes as { method: string; path: string }[])
          .filter((r) => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method))
          .map((r) => r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')),
      ),
    ];
    const undocumented = routePaths.filter((p) => !documented.has(p));
    expect(undocumented).toEqual([]);
  });

  it('requires a bearer token', async () => {
    expect((await app.request('/api/whoami')).status).toBe(401);
  });

  it('accepts a valid token', async () => {
    const r = await app.request('/api/whoami', { headers: auth() });
    expect(r.status).toBe(200);
  });

  it('creates a target then a scan (queued + enqueued) and reads it back', async () => {
    const tr = await app.request('/api/targets', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ projectId, domain: 'example.com', predefinedSubdomains: ['a.example.com'] }),
    });
    expect(tr.status).toBe(201);
    const { target } = (await tr.json()) as { target: { id: string } };

    const sr = await app.request('/api/scans', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ targetId: target.id }),
    });
    expect(sr.status).toBe(202);
    const { scan } = (await sr.json()) as { scan: { id: string; status: string } };
    expect(scan.status).toBe('queued');
    expect(enqueued).toContain(scan.id);

    expect((await app.request(`/api/scans/${scan.id}`, { headers: auth() })).status).toBe(200);
    const results = await app.request(`/api/scans/${scan.id}/results`, { headers: auth() });
    expect(results.status).toBe(200);
    expect((await results.json()).endpoints).toEqual([]);
  });

  it('cancels a queued scan (sets cancelled) and is idempotent on terminal scans', async () => {
    const tr = await app.request('/api/targets', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ projectId, domain: 'cancel.com' }),
    });
    const { target } = (await tr.json()) as { target: { id: string } };
    const sr = await app.request('/api/scans', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ targetId: target.id }),
    });
    const { scan } = (await sr.json()) as { scan: { id: string } };
    const cancel = await app.request(`/api/scans/${scan.id}/cancel`, { method: 'POST', headers: auth() });
    expect(cancel.status).toBe(200);
    expect((await cancel.json()).scan.status).toBe('cancelled');
    // Idempotent: cancelling an already-cancelled scan is a no-op 200.
    const again = await app.request(`/api/scans/${scan.id}/cancel`, { method: 'POST', headers: auth() });
    expect(again.status).toBe(200);
  });

  it('paginates the scans list (limit/offset/total)', async () => {
    const r = await app.request('/api/scans?limit=1&offset=0', { headers: auth() });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { scans: unknown[]; total: number; limit: number; offset: number };
    expect(body.limit).toBe(1);
    expect(body.scans.length).toBeLessThanOrEqual(1);
    expect(typeof body.total).toBe('number');
  });

  it('search returns categorised hits', async () => {
    const r = await app.request('/api/search?q=example', { headers: auth() });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { hits: { kind: string }[] };
    expect(Array.isArray(body.hits)).toBe(true);
  });

  it('rejects an invalid target payload', async () => {
    const r = await app.request('/api/targets', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ domain: '' }),
    });
    expect(r.status).toBe(400);
  });

  describe('RBAC enforcement', () => {
    // Mint a token for a given role and return an auth header factory.
    const tokenFor = async (role: string) => {
      const db = handle.db;
      const [u] = await db
        .insert(users)
        .values({ email: `${role}${Date.now()}@x.com`, passwordHash: 'x', role })
        .returning();
      const t = generateApiToken();
      await db.insert(apiTokens).values({ userId: u!.id, label: role, tokenHash: t.hash });
      return () => ({ Authorization: `Bearer ${t.plaintext}`, 'content-type': 'application/json' });
    };

    it('Auditor can read but not mutate', async () => {
      const aud = await tokenFor('Auditor');
      expect((await app.request('/api/scans', { headers: aud() })).status).toBe(200); // read OK
      const post = await app.request('/api/scans', {
        method: 'POST',
        headers: aud(),
        body: JSON.stringify({ targetId: '00000000-0000-0000-0000-000000000000' }),
      });
      expect(post.status).toBe(403); // initiate_scans denied
      const tg = await app.request('/api/targets', {
        method: 'POST',
        headers: aud(),
        body: JSON.stringify({ projectId, domain: 'denied.com' }),
      });
      expect(tg.status).toBe(403); // modify_targets denied
    });

    it('PenetrationTester is denied system config (webhooks)', async () => {
      const pt = await tokenFor('PenetrationTester');
      const wh = await app.request('/api/webhooks', {
        method: 'POST',
        headers: pt(),
        body: JSON.stringify({ projectId, channel: 'generic', url: 'https://example.com/hook' }),
      });
      expect(wh.status).toBe(403);
    });

    it('SysAdmin can do system config', async () => {
      const sa = await tokenFor('SysAdmin');
      const wh = await app.request('/api/webhooks', {
        method: 'POST',
        headers: sa(),
        body: JSON.stringify({ projectId, channel: 'generic', url: 'https://example.com/hook' }),
      });
      expect(wh.status).toBe(201);
    });

    it('Auditor is denied a new mutating endpoint (project create)', async () => {
      const aud = await tokenFor('Auditor');
      const r = await app.request('/api/projects', {
        method: 'POST',
        headers: aud(),
        body: JSON.stringify({ name: 'Denied', slug: `denied${Date.now()}` }),
      });
      expect(r.status).toBe(403);
    });

    it('user CRUD: SysAdmin creates + deletes; Penetration Tester denied; guards enforced', async () => {
      const sa = await tokenFor('SysAdmin');
      const pt = await tokenFor('PenetrationTester');
      const email = `crud${Date.now()}@x.com`;
      // PenetrationTester cannot manage users (system config).
      const denied = await app.request('/api/users', {
        method: 'POST',
        headers: pt(),
        body: JSON.stringify({ email, password: 'password1', role: 'Auditor' }),
      });
      expect(denied.status).toBe(403);
      // SysAdmin creates a user.
      const created = await app.request('/api/users', {
        method: 'POST',
        headers: sa(),
        body: JSON.stringify({ email, password: 'password1', role: 'Auditor' }),
      });
      // POST /users returns 201 Created (matches the route and the OpenAPI contract).
      expect(created.status).toBe(201);
      const { id } = (await created.json()) as { id: string };
      // Duplicate email rejected.
      const dup = await app.request('/api/users', {
        method: 'POST',
        headers: sa(),
        body: JSON.stringify({ email, password: 'password1', role: 'Auditor' }),
      });
      expect(dup.status).toBe(409);
      // Weak password rejected.
      const weak = await app.request('/api/users', {
        method: 'POST',
        headers: sa(),
        body: JSON.stringify({ email: `w${Date.now()}@x.com`, password: 'short', role: 'Auditor' }),
      });
      expect(weak.status).toBe(400);
      // SysAdmin deletes the user.
      const del = await app.request(`/api/users/${id}`, { method: 'DELETE', headers: sa() });
      expect(del.status).toBe(200);
    });
  });

  describe('parity endpoints', () => {
    it('creates then updates a project', async () => {
      const slug = `parity${Date.now()}`;
      const created = await app.request('/api/projects', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Parity', slug }),
      });
      expect(created.status).toBe(201);
      const { project } = (await created.json()) as { project: { id: string } };
      const updated = await app.request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ name: 'Parity 2', sector: 'banking' }),
      });
      expect(updated.status).toBe(200);
      const body = (await updated.json()) as { project: { name: string; sector: string } };
      expect(body.project.name).toBe('Parity 2');
      expect(body.project.sector).toBe('banking');
      // Invalid sector rejected.
      const bad = await app.request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ name: 'x', sector: 'not-a-sector' }),
      });
      expect(bad.status).toBe(400);
    });

    it('updates then deletes a scan profile', async () => {
      const created = await app.request('/api/profiles', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'P', tools: { httpx: true } }),
      });
      expect(created.status).toBe(201);
      const { profile } = (await created.json()) as { profile: { id: string } };
      const updated = await app.request(`/api/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ name: 'P2', ports: 'top-1000' }),
      });
      expect(updated.status).toBe(200);
      expect(((await updated.json()) as { profile: { name: string } }).profile.name).toBe('P2');
      const del = await app.request(`/api/profiles/${profile.id}`, { method: 'DELETE', headers: auth() });
      expect(del.status).toBe(200);
    });

    it('bulk-sets vulnerability status (validates the status)', async () => {
      const ok = await app.request('/api/vulnerabilities/bulk/status', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000000'], status: 'false_positive' }),
      });
      expect(ok.status).toBe(200);
      const bad = await app.request('/api/vulnerabilities/bulk/status', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000000'], status: 'bogus' }),
      });
      expect(bad.status).toBe(400);
    });

    it('API tokens: create (plaintext once) + list + delete', async () => {
      const created = await app.request('/api/tokens', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ label: 'scripted' }),
      });
      expect(created.status).toBe(201);
      const { token: plaintext, id } = (await created.json()) as { token: string; id: string };
      expect(plaintext.length).toBeGreaterThan(10);

      const listed = await app.request('/api/tokens', { headers: auth() });
      expect(listed.status).toBe(200);
      const { tokens } = (await listed.json()) as { tokens: { id: string; tokenHash?: string }[] };
      expect(tokens.some((t) => t.id === id)).toBe(true);
      // The hash must never be exposed.
      expect(tokens.every((t) => t.tokenHash === undefined)).toBe(true);

      const del = await app.request(`/api/tokens/${id}`, { method: 'DELETE', headers: auth() });
      expect(del.status).toBe(200);
    });
  });
});
