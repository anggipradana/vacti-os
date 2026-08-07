import { and, count, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadEnv } from '@vacti/config';
import { cronMatches, Severity, SEVERITY_LABEL, type SeverityValue } from '@vacti/core';
import {
  createDb,
  runMigrations,
  scans,
  scanActivity,
  targets,
  scanProfiles,
  scanSchedules,
  vulnerabilities,
  leakcheckData,
  projects,
  extensionCategories,
  extensionSuffixRules,
  sessions,
  networkSettings,
} from '@vacti/db';
import { createQueue } from '@vacti/queue';
import { setGlobalDispatcher } from 'undici';
import {
  runScanPipeline,
  runPassiveScan,
  makeProxyDispatcher,
  redactProxyUrl,
  DEFAULT_CATEGORIES,
  type ScanProfile,
} from '@vacti/recon';
import { refreshThreatIntel } from '@vacti/threat-intel';
import {
  sendProjectNotifications,
  getProjectSecret,
  acquireRotatingKey,
  backoffKey,
  countProviderKeys,
} from '@vacti/integrations';

const scanJobSchema = z.object({ scanId: z.string().uuid() });
const tiJobSchema = z.object({ projectId: z.string().uuid() });

const DEFAULT_PROFILE: ScanProfile = {
  tools: { subfinder: true, httpx: true, naabu: true, nuclei: true, wordfence: true },
  ports: 'top-100',
  // Include 'info': a manual `nuclei -u` defaults to ALL severities, and info-level templates
  // (exposed files/panels, tech + TLS + header checks) are the bulk of real findings. Excluding
  // them made scans look near-empty versus a manual run.
  severities: ['critical', 'high', 'medium', 'low', 'info'],
  timeoutSec: 3600,
};

async function main(): Promise<void> {
  const env = loadEnv();
  console.log('[worker] running migrations…');
  await runMigrations(env.DATABASE_URL);
  const { db } = createDb(env.DATABASE_URL);

  // Route all worker outbound traffic (OSINT/deep-fetch) through a proxy when configured. The
  // web-configurable DB value (network_settings, Settings > Network) wins over env.PROXY_URL, which
  // stays the fallback. The dispatcher is set ONCE here at boot, so a proxy change from the UI takes
  // effect on the next worker restart (we do NOT hot-reload it). The DB read is defensive: if the table
  // is not migrated yet it falls back to env rather than crashing the worker.
  let proxyUrl: string | null = env.PROXY_URL ?? null;
  try {
    const [netRow] = await db.select().from(networkSettings).where(eq(networkSettings.id, 'default'));
    if (netRow?.proxyUrl) proxyUrl = netRow.proxyUrl;
  } catch (err) {
    console.warn(
      '[worker] network_settings unavailable, using env PROXY_URL:',
      err instanceof Error ? err.message : err,
    );
  }
  if (proxyUrl) {
    const dispatcher = makeProxyDispatcher(proxyUrl);
    if (dispatcher) {
      setGlobalDispatcher(dispatcher);
      // Redact: the URL may carry user:pass credentials - log only protocol+host, never the full value.
      console.log(`[worker] outbound proxy enabled (${redactProxyUrl(proxyUrl)})`);
    } else {
      console.warn('[worker] proxy URL set but invalid - ignoring');
    }
  }

  // Reap orphaned scans: a freshly-started worker means nothing is mid-flight, so any scan still
  // marked 'running' was abandoned by a worker that died (restart/crash) - its pg-boss job is gone
  // and nothing will ever resume it. Fail it cleanly so it never stays stuck ("no stuck scans").
  const reaped = await db
    .update(scans)
    .set({ status: 'failed', stage: 'interrupted', error: 'Interrupted (worker restarted)', finishedAt: new Date() })
    .where(eq(scans.status, 'running'))
    .returning({ id: scans.id });
  if (reaped.length) console.log(`[worker] reaped ${reaped.length} orphaned scan(s) stuck in 'running'`);

  // Live watchdog: even while the worker stays up, a scan that runs far longer than any real scan
  // should (stalled tool, hung host, lost job) must never sit "running" forever. The cap is generous
  // (default 60 min vs a ~10-16 min normal scan) so a legitimately long scan is safe.
  // Live runs hold their AbortController here; the per-run deadline (below) aborts them for real
  // (kills child processes), so the watchdog only relabels rows NO live handler owns (orphans) -
  // relabeling a live run would race the handler's own terminal update.
  const liveRuns = new Map<string, AbortController>();
  const MAX_SCAN_MS = Number(process.env.SCAN_MAX_RUNTIME_MS ?? 60 * 60 * 1000);
  const watchdog = setInterval(() => {
    void db
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.status, 'running'), lt(scans.startedAt, new Date(Date.now() - MAX_SCAN_MS))))
      .then(async (rows) => {
        const orphaned = rows.map((r) => r.id).filter((id) => !liveRuns.has(id));
        if (!orphaned.length) return;
        await db
          .update(scans)
          .set({ status: 'failed', stage: 'interrupted', error: 'Stalled (watchdog timeout)', finishedAt: new Date() })
          .where(and(inArray(scans.id, orphaned), eq(scans.status, 'running')));
        console.log(`[worker] watchdog failed ${orphaned.length} stalled orphaned scan(s)`);
      })
      .catch((err) => console.error('[worker] watchdog error:', err));
    // Queued scans whose pg-boss job was truly LOST (enqueue failed, queue wiped) have startedAt=null
    // and are invisible to the running-watchdog above. Fail them after a window - but ONLY when no
    // live pg-boss job references them: the worker processes scans serially, so a real backlog can
    // sit 'queued' for hours legitimately, and a plain age check would wrongly fail those. The
    // NOT EXISTS against pgboss.job distinguishes "job lost" from "still waiting in the queue". On
    // any error (e.g. pgboss schema query fails) we skip reaping rather than risk a false failure.
    void db
      .execute(
        sql`update scans set status='failed', stage='interrupted',
              error='Never picked up (queue job lost)', finished_at=now()
            where status='queued' and created_at < now() - interval '2 hours'
              and not exists (
                select 1 from pgboss.job j
                where j.name='scan' and j.data->>'scanId' = scans.id::text
                  and j.state in ('created','active','retry')
              )
            returning id`,
      )
      .then((res) => {
        const r = res as { rowCount?: number; length?: number };
        const n = r.rowCount ?? r.length ?? 0;
        if (n) console.log(`[worker] watchdog failed ${n} lost queued scan(s)`);
      })
      .catch((err) => console.error('[worker] watchdog error (queued):', err));
  }, 60_000);
  watchdog.unref();

  // Seed/refresh the editable file-category buckets (idempotent) from the canonical defaults.
  for (const cat of DEFAULT_CATEGORIES) {
    const [row] = await db
      .insert(extensionCategories)
      .values({ slug: cat.slug, displayName: cat.displayName })
      .onConflictDoUpdate({ target: extensionCategories.slug, set: { displayName: cat.displayName } })
      .returning({ id: extensionCategories.id });
    if (row) {
      for (const suffix of cat.suffixes) {
        await db.insert(extensionSuffixRules).values({ categoryId: row.id, suffix }).onConflictDoNothing();
      }
    }
  }

  const queue = createQueue(env.DATABASE_URL);
  await queue.start();

  // Process scans concurrently: a multi-target project would otherwise run them one-at-a-time and
  // look stuck. SCAN_CONCURRENCY (default 2) sets how many run in parallel - each handler operates on
  // its own scan row + AbortController + timers (liveRuns is keyed by scanId), so parallelism is safe.
  const scanConcurrency = Math.max(1, Number(process.env.SCAN_CONCURRENCY ?? 2));
  await queue.work(
    'scan',
    scanJobSchema,
    async ({ scanId }) => {
      const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
      if (!scan) return;
      // Cancelled while still queued - never start it.
      if (scan.status === 'cancelled' || scan.cancelRequested) {
        await db.update(scans).set({ status: 'cancelled', finishedAt: new Date() }).where(eq(scans.id, scanId));
        return;
      }
      const [target] = await db.select().from(targets).where(eq(targets.id, scan.targetId));
      if (!target) {
        // Target deleted while the scan sat queued: terminate the row, never leave it stuck 'queued'.
        await db
          .update(scans)
          .set({ status: 'failed', stage: 'interrupted', error: 'Target no longer exists', finishedAt: new Date() })
          .where(eq(scans.id, scanId));
        return;
      }
      let profile = DEFAULT_PROFILE;
      if (scan.profileId) {
        const [p] = await db.select().from(scanProfiles).where(eq(scanProfiles.id, scan.profileId));
        if (p)
          profile = {
            tools: p.tools as ScanProfile['tools'],
            ports: p.ports,
            severities: p.severities,
            config: (p.config as ScanProfile['config']) ?? undefined,
            timeoutSec: p.timeoutSec ?? undefined,
          };
      }
      // Sub-scan: a per-scan tool subset overrides the profile's tools.
      if (scan.toolsOverride) {
        profile = { ...profile, tools: scan.toolsOverride as ScanProfile['tools'] };
      }
      // Per-scan timeout (set on the new-scan form) wins over the profile, else the in-code default.
      if (scan.timeoutSec != null) {
        profile = { ...profile, timeoutSec: scan.timeoutSec };
      }
      console.log(`[worker] scan ${scanId} starting (${target.domain})`);
      // scan.started is a subscribable webhook event, so actually emit it (best-effort) - otherwise a
      // webhook subscribed only to scan.started would silently never fire.
      await sendProjectNotifications(db, scan.projectId, {
        type: 'scan.started',
        title: `Scan started: ${target.domain}`,
        message: `${scan.mode ?? 'active'} scan queued and now running.`,
        severity: 'info',
        fields: { Target: target.domain, Mode: scan.mode ?? 'active' },
      }).catch((e) => console.error(`[worker] scan.started notify failed (${scanId}):`, e));
      // Poll the cancel flag and abort the in-flight run (kills child processes).
      const controller = new AbortController();
      liveRuns.set(scanId, controller);
      // Hard wall-clock deadline owned by the handler itself: aborting the controller SIGKILLs the
      // child process group, so a hung tool cannot hold the run (and its job slot) forever. The
      // per-scan "Timeout (menit)" (scan.timeoutSec) raises this above the 1h MAX_SCAN_MS floor, so a
      // big multi-domain scan is not silently cut short at the default.
      let stalled = false;
      const scanDeadlineMs = Math.max(MAX_SCAN_MS, (scan.timeoutSec ?? 0) * 1000);
      const deadline = setTimeout(() => {
        // If a user cancel already aborted, this is a cancel, not a stall - don't relabel it.
        if (controller.signal.aborted) return;
        stalled = true;
        console.log(`[worker] scan ${scanId} exceeded max runtime, aborting`);
        controller.abort();
      }, scanDeadlineMs);
      const poll = setInterval(() => {
        void db
          .select()
          .from(scans)
          .where(eq(scans.id, scanId))
          .then(([s]) => {
            if (s?.cancelRequested && !controller.signal.aborted) {
              console.log(`[worker] scan ${scanId} cancellation requested`);
              controller.abort();
            }
          })
          // A transient DB error here must not become an unhandled rejection (it would kill the worker).
          .catch((err) => console.error(`[worker] cancel-poll error (${scanId}):`, err));
      }, 2000);
      const mode = scan.mode ?? 'active';
      // Catch (not propagate) the run error: the pipeline already persisted status='failed' before
      // re-throwing, and swallowing it here lets the notification block below run for FAILED scans
      // too (it previously only fired for completed/stalled). retryLimit is 0, so not re-throwing
      // just means pg-boss marks the job done instead of failed - we don't rely on its retry.
      try {
        // Passive phase (mode passive|full): OSINT discovery + exposure, no binaries.
        let passiveHosts: string[] = [];
        if (mode === 'passive' || mode === 'full') {
          await db
            .update(scans)
            .set({ status: 'running', stage: 'passive', startedAt: new Date() })
            .where(eq(scans.id, scanId));
          try {
            // VT keys: rotate over vault keys (virustotal, virustotal-2, …) with Postgres quota/backoff;
            // fall back to the env key when none are in the vault.
            const hasVaultVt = (await countProviderKeys(db, scan.projectId, 'virustotal')) > 0;
            const vtKeyProvider = hasVaultVt
              ? {
                  next: () => acquireRotatingKey(db, scan.projectId, 'virustotal', env.ENCRYPTION_KEY),
                  report: (id: string, status: number) => backoffKey(db, id, status === 429 ? 900 : 300),
                }
              : undefined;
            const vtKey = hasVaultVt ? null : (env.VT_API_KEY ?? null);
            const urlscanKey =
              (await getProjectSecret(db, scan.projectId, 'urlscan', env.ENCRYPTION_KEY)) ??
              env.URLSCAN_API_KEY ??
              null;
            const res = await runPassiveScan(
              {
                scanId,
                projectId: scan.projectId,
                targetId: scan.targetId,
                domain: target.domain,
                vtApiKey: vtKey,
                vtKeyProvider,
                urlscanApiKey: urlscanKey,
                deepScan: scan.deepScan,
                signal: controller.signal,
              },
              { db, onProgress: (stage, msg) => console.log(`[passive ${scanId}] ${stage}: ${msg}`) },
            );
            passiveHosts = res.hosts;
          } catch (err) {
            // A deadline abort is a stall, not a user cancel: label it failed with the real reason.
            const aborted = controller.signal.aborted && !stalled;
            const msg = stalled ? 'Stalled (max runtime exceeded)' : err instanceof Error ? err.message : String(err);
            await db
              .insert(scanActivity)
              .values({ scanId, stage: 'done', status: aborted ? 'cancelled' : 'failed', message: msg });
            await db
              .update(scans)
              .set({
                status: aborted ? 'cancelled' : 'failed',
                stage: aborted ? 'cancelled' : 'failed',
                error: msg,
                finishedAt: new Date(),
              })
              .where(eq(scans.id, scanId));
            throw err;
          }
        }
        if (mode === 'passive') {
          await db
            .insert(scanActivity)
            .values({ scanId, stage: 'done', status: 'completed', message: 'passive scan complete' });
          await db
            .update(scans)
            .set({ status: 'completed', stage: 'done', finishedAt: new Date() })
            .where(eq(scans.id, scanId));
        } else {
          // active|full → binary pipeline (full feeds the passively-discovered hosts in as predefined).
          const predefined =
            mode === 'full'
              ? [
                  ...new Set([
                    ...(target.predefinedSubdomains ?? []),
                    ...passiveHosts.filter((h) => h !== target.domain),
                  ]),
                ]
              : target.predefinedSubdomains;
          await runScanPipeline(
            {
              scanId,
              domain: target.domain,
              predefinedSubdomains: predefined,
              profile,
              customHeaders: (target.customHeaders as Record<string, string> | null) ?? undefined,
              signal: controller.signal,
            },
            { db, onProgress: (stage, msg) => console.log(`[scan ${scanId}] ${stage}: ${msg}`) },
          );
        }
      } catch (err) {
        // Status already persisted by the pipeline; log and fall through to notify.
        console.error(`[worker] scan ${scanId} failed:`, err instanceof Error ? err.message : err);
      } finally {
        clearInterval(poll);
        clearTimeout(deadline);
        liveRuns.delete(scanId);
      }
      // A deadline abort goes through the pipelines' abort path (which labels it 'cancelled');
      // relabel it as a stall so the user sees what actually happened.
      if (stalled) {
        await db
          .update(scans)
          .set({ status: 'failed', stage: 'interrupted', error: 'Stalled (max runtime exceeded)' })
          .where(and(eq(scans.id, scanId), eq(scans.status, 'cancelled')));
      }
      const [done] = await db.select().from(scans).where(eq(scans.id, scanId));
      if (done && done.status !== 'cancelled') {
        const counts = (done.counts ?? {}) as Record<string, number>;
        const passiveMsg = counts.discoveredUrls
          ? ` · ${counts.discoveredUrls} URLs · ${counts.exposureFindings ?? 0} exposures · ${counts.ipResolutions ?? 0} IPs`
          : '';
        await sendProjectNotifications(db, done.projectId, {
          type: done.status === 'completed' ? 'scan.completed' : 'scan.failed',
          title: `Scan ${done.status}: ${target.domain}`,
          message: `${counts.endpoints ?? 0} endpoints · ${counts.ports ?? 0} ports · ${counts.vulnerabilities ?? 0} vulns${passiveMsg}`,
          severity: done.status === 'completed' ? 'success' : 'error',
          fields: { Status: done.status, Target: target.domain },
        });

        // Dedicated high-severity alert so subscribers can be paged on the findings that matter.
        if (done.status === 'completed') {
          const sev = await db
            .select()
            .from(vulnerabilities)
            .where(
              and(
                eq(vulnerabilities.scanId, scanId),
                inArray(vulnerabilities.severity, [Severity.Critical, Severity.High]),
              ),
            );
          if (sev.length) {
            const crit = sev.filter((v) => v.severity === Severity.Critical).length;
            const preview = sev
              .slice(0, 5)
              .map((v) => `${SEVERITY_LABEL[v.severity as SeverityValue].toUpperCase()} · ${v.name}`)
              .join('\n');
            await sendProjectNotifications(db, done.projectId, {
              type: 'vuln.found',
              title: `${sev.length} high/critical finding(s): ${target.domain}`,
              message: preview + (sev.length > 5 ? `\n…and ${sev.length - 5} more` : ''),
              severity: crit > 0 ? 'error' : 'warning',
              fields: { Target: target.domain, Critical: String(crit), High: String(sev.length - crit) },
            });
          }
        }
      }
    },
    { batchSize: scanConcurrency, concurrent: true },
  );

  await queue.work('ti-refresh', tiJobSchema, async ({ projectId }) => {
    console.log(`[worker] threat-intel refresh ${projectId}`);
    // Per-project vault keys override the environment defaults.
    const otxKey = (await getProjectSecret(db, projectId, 'otx', env.ENCRYPTION_KEY)) ?? env.OTX_API_KEY;
    const leakKey = (await getProjectSecret(db, projectId, 'leakcheck', env.ENCRYPTION_KEY)) ?? env.LEAKCHECK_API_KEY;
    const vtKey = (await getProjectSecret(db, projectId, 'virustotal', env.ENCRYPTION_KEY)) ?? env.VT_API_KEY;
    const leaksBefore = await db
      .select({ n: count() })
      .from(leakcheckData)
      .where(eq(leakcheckData.projectId, projectId));
    await refreshThreatIntel({
      db,
      projectId,
      otxKey,
      leakKey,
      vtKey,
      retentionDays: env.NEWS_RETENTION_DAYS,
      onProgress: (p, msg) => console.log(`[ti ${projectId}] ${p}% ${msg}`),
    });
    const leaksAfter = await db
      .select({ n: count() })
      .from(leakcheckData)
      .where(eq(leakcheckData.projectId, projectId));
    const newLeaks = Number(leaksAfter[0]?.n ?? 0) - Number(leaksBefore[0]?.n ?? 0);
    if (newLeaks > 0) {
      await sendProjectNotifications(db, projectId, {
        type: 'ti.refreshed',
        title: `${newLeaks} new leaked credential(s)`,
        message: `Threat-intel refresh surfaced ${newLeaks} newly leaked credential(s) for this project.`,
        severity: 'warning',
        fields: { 'New leaks': String(newLeaks) },
      });
    }
  });

  await queue.work('echo', z.object({ msg: z.string() }), async (p) => console.log(`[worker] echo: ${p.msg}`));

  // Scheduled scans - a once-a-minute tick evaluates scan_schedules (lightweight cron, no Celery-beat).
  await queue.work('schedule-tick', z.unknown(), async () => {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60000);
    const rows = await db.select().from(scanSchedules).where(eq(scanSchedules.enabled, true));
    for (const s of rows) {
      if (!cronMatches(s.cron, now)) continue;
      // Atomic once-per-minute claim: flip lastRunAt first with a guard so two overlapping ticks
      // can never both pass (the old read-then-write check raced and could double-fire).
      const claimed = await db
        .update(scanSchedules)
        .set({ lastRunAt: now })
        .where(
          and(
            eq(scanSchedules.id, s.id),
            or(isNull(scanSchedules.lastRunAt), lt(scanSchedules.lastRunAt, new Date(minute * 60000))),
          ),
        )
        .returning({ id: scanSchedules.id });
      if (!claimed.length) continue;
      const [target] = await db.select().from(targets).where(eq(targets.id, s.targetId));
      if (!target) continue;
      const [scan] = await db
        .insert(scans)
        .values({ projectId: target.projectId, targetId: target.id, profileId: s.profileId ?? null })
        .returning();
      await queue.enqueue('scan', scanJobSchema, { scanId: scan!.id });
      console.log(`[worker] scheduled scan ${scan!.id} for ${target.domain} (cron ${s.cron})`);
    }
  });
  await queue.schedule('schedule-tick', '* * * * *');

  // Daily news refresh at 09:00 local time (TZ env, Asia/Jakarta in compose) - enqueues a TI
  // refresh (sector + brand news, capped to NEWS_CAP) for every project, so news stays fresh.
  await queue.work('news-refresh-daily', z.unknown(), async () => {
    const projs = await db.select({ id: projects.id }).from(projects);
    for (const p of projs) await queue.enqueue('ti-refresh', tiJobSchema, { projectId: p.id });
    console.log(`[worker] daily news refresh: enqueued ti-refresh for ${projs.length} project(s)`);
  });
  await queue.schedule('news-refresh-daily', '0 9 * * *');

  // Drop retired cron registrations. pg-boss keeps a schedule alive after the code stops calling
  // schedule() for it, so these renamed/removed jobs kept firing handler-less jobs that piled up in
  // `created` forever: 'threat-intel-refresh' (renamed to news-refresh-daily) and
  // 'technique-intel-refresh' (feature removed). Idempotent; self-heals every instance on deploy.
  for (const retired of ['threat-intel-refresh', 'technique-intel-refresh']) {
    await queue.unschedule(retired);
  }

  // Purge expired session rows hourly so the sessions table can't grow unbounded (getCurrentUser reaps
  // rows it touches, but idle/abandoned sessions are never revisited). Non-fatal: a transient DB error
  // must not crash the worker.
  const sessionSweep = setInterval(
    () => {
      void db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .catch((err) => console.error('[worker] session sweep error:', err));
    },
    60 * 60 * 1000,
  );
  sessionSweep.unref?.();

  console.log('[worker] started; consuming scan + ti-refresh + schedule-tick + news-refresh-daily queues');

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received, shutting down…`);
    clearInterval(watchdog);
    await queue.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
