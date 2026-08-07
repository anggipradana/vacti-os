import { handle } from 'hono/vercel';
import { z } from 'zod';
import { buildApi } from '@vacti/api';
import { getDb } from '../../../lib/db';
import { getQueue } from '../../../lib/queue';
import { getCurrentUser } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The interactive docs + spec require a logged-in session (humans browsing). /api/health and the
// token-authenticated endpoints are unaffected.
const DOCS_PATHS = new Set(['/api/docs', '/api/openapi.json']);
async function gateDocs(req: Request): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  if (!DOCS_PATHS.has(pathname)) return null;
  if (await getCurrentUser()) return null;
  return pathname === '/api/docs'
    ? Response.redirect(new URL('/login', req.url), 302)
    : Response.json({ error: 'unauthorized' }, { status: 401 });
}

const scanJob = z.object({ scanId: z.string().uuid() });
const tiJob = z.object({ projectId: z.string().uuid() });

// Built lazily so `next build` never evaluates env / connects to the DB.
let handler: ReturnType<typeof handle> | undefined;
function getHandler(): ReturnType<typeof handle> {
  if (!handler) {
    const app = buildApi({
      db: getDb(),
      enqueueScan: async (scanId) => {
        const q = await getQueue();
        await q.enqueue('scan', scanJob, { scanId });
      },
      enqueueTiRefresh: async (projectId) => {
        const q = await getQueue();
        await q.enqueue('ti-refresh', tiJob, { projectId });
      },
    });
    handler = handle(app);
  }
  return handler;
}

export async function GET(req: Request): Promise<Response> {
  return (await gateDocs(req)) ?? getHandler()(req);
}
// Next App Router only routes the HTTP methods a route file EXPORTS - anything else 405s before it
// reaches Hono. The REST API defines PATCH + DELETE (+ PUT) endpoints (update/delete projects, targets,
// scans, users, tokens, webhooks, findings, ...), so every verb must be forwarded, not just GET/POST.
const forward = (req: Request): Response | Promise<Response> => getHandler()(req);
export { forward as POST, forward as PUT, forward as PATCH, forward as DELETE, forward as OPTIONS };
