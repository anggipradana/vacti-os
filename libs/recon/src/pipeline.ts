import { eq, sql } from 'drizzle-orm';
import type { Database } from '@vacti/db';
import { scans, scanActivity, commands, subdomains, endpoints, ports as portsTable, vulnerabilities } from '@vacti/db';
import { runTool, type RunResult } from './runner';
import { subfinderArgs, parseSubfinderLine } from './adapters/subfinder';
import { httpxArgs, parseHttpxLine } from './adapters/httpx';
import { naabuArgs, parseNaabuLine } from './adapters/naabu';
import { nucleiArgs, parseNucleiLine, type VulnResult } from './adapters/nuclei';
import { isWordPress } from './wordpress';
import { isInterestingEndpoint } from './keywords';

/** Advanced per-tool options + scan scoping, persisted as scan_profiles.config (see 09-SCAN-CONFIG.md). */
export interface ScanProfileConfig {
  userAgent?: string;
  headers?: Record<string, string>;
  rateLimit?: number;
  concurrency?: number;
  retries?: number;
  nucleiTags?: string[];
  nucleiTemplates?: string[];
  nucleiExcludeTags?: string[];
  excludeSubdomains?: string[];
  /** Override the default "interesting endpoint" keyword list (admin/login/.env/…). */
  interestingKeywords?: string[];
  extraArgs?: { nuclei?: string[]; httpx?: string[]; subfinder?: string[]; naabu?: string[] };
  /** Per-tool overrides - take precedence over the shared flat fields above (backward compatible). */
  httpx?: { userAgent?: string; rateLimit?: number; concurrency?: number };
  nuclei?: {
    userAgent?: string;
    rateLimit?: number;
    concurrency?: number;
    retries?: number;
    tags?: string[];
    templates?: string[];
    excludeTags?: string[];
    extraArgs?: string[];
  };
}

export interface ScanProfile {
  tools: { subfinder?: boolean; httpx?: boolean; naabu?: boolean; nuclei?: boolean; wordfence?: boolean };
  ports: string;
  severities: string[];
  timeoutSec?: number;
  config?: ScanProfileConfig;
}

export interface ScanInput {
  scanId: string;
  domain: string;
  predefinedSubdomains?: string[];
  profile: ScanProfile;
  /** Custom request headers (per target) passed to httpx + nuclei. */
  customHeaders?: Record<string, string>;
  signal?: AbortSignal;
}

export interface PipelineDeps {
  db: Database;
  onProgress?: (stage: string, message: string) => void;
}

/**
 * Linear recon pipeline: subfinder (skippable) → httpx → naabu → nuclei (+ conditional wordfence).
 * Persists results, records every command + activity, and completes idempotently (status set once).
 */
export async function runScanPipeline(input: ScanInput, deps: PipelineDeps): Promise<void> {
  const { db } = deps;
  const timeoutMs = (input.profile.timeoutSec ?? 3600) * 1000;
  const cfg = input.profile.config ?? {};
  // Profile headers merge under the target's custom headers (target wins on conflict).
  const reqHeaders = { ...(cfg.headers ?? {}), ...(input.customHeaders ?? {}) };
  const excluded = new Set((cfg.excludeSubdomains ?? []).map((s) => s.toLowerCase()));
  // Resolve per-tool options: a tool's own override wins, else the shared flat field (legacy profiles).
  const httpxCfg = {
    userAgent: cfg.httpx?.userAgent ?? cfg.userAgent,
    rateLimit: cfg.httpx?.rateLimit ?? cfg.rateLimit,
    concurrency: cfg.httpx?.concurrency ?? cfg.concurrency,
  };
  const nucleiCfg = {
    userAgent: cfg.nuclei?.userAgent ?? cfg.userAgent,
    rateLimit: cfg.nuclei?.rateLimit ?? cfg.rateLimit,
    concurrency: cfg.nuclei?.concurrency ?? cfg.concurrency,
    retries: cfg.nuclei?.retries ?? cfg.retries,
    tags: cfg.nuclei?.tags ?? cfg.nucleiTags,
    templates: cfg.nuclei?.templates ?? cfg.nucleiTemplates,
    excludeTags: cfg.nuclei?.excludeTags ?? cfg.nucleiExcludeTags,
    extraArgs: cfg.nuclei?.extraArgs ?? cfg.extraArgs?.nuclei,
  };
  const counts = { subdomains: 0, endpoints: 0, ports: 0, vulnerabilities: 0 };
  // Backstop for cancellation between stages (a running tool is killed via the AbortSignal directly).
  const checkAbort = () => {
    if (input.signal?.aborted) throw new Error('cancelled');
  };
  // Merge into the existing counts jsonb instead of replacing it: in 'full' mode the passive phase
  // already wrote discoveredUrls/exposureFindings/ipResolutions, which a plain set() would clobber.
  const mergedCounts = () => sql`coalesce(${scans.counts}, '{}'::jsonb) || ${JSON.stringify(counts)}::jsonb`;

  const activity = async (stage: string, status: string, message?: string): Promise<void> => {
    await db.insert(scanActivity).values({ scanId: input.scanId, stage, status, message });
    deps.onProgress?.(stage, message ?? status);
  };
  // A SIGKILLed (timed-out) tool still resolves with partial lines; surface that in the timeline
  // instead of silently labelling the stage completed.
  const stageStatus = (r: RunResult) => (r.timedOut ? 'failed' : 'completed');
  const stageNote = (r: RunResult, msg: string) =>
    r.timedOut ? `${msg} (tool timed out after ${Math.round(r.durationMs / 1000)}s, partial results)` : msg;
  const record = async (tool: string, args: string[], r: RunResult): Promise<void> => {
    await db
      .insert(commands)
      .values({ scanId: input.scanId, tool, argv: [tool, ...args], exitCode: r.code, durationMs: r.durationMs });
  };
  const insertVulns = async (vulns: VulnResult[]): Promise<void> => {
    if (!vulns.length) return;
    await db.insert(vulnerabilities).values(
      vulns.map((v) => ({
        scanId: input.scanId,
        templateId: v.templateId,
        name: v.name,
        severity: v.severity,
        type: v.type,
        host: v.host,
        port: v.port,
        url: v.url,
        matchedAt: v.matchedAt,
        tags: v.tags,
        request: v.request,
        response: v.response,
        description: v.description,
        remediation: v.remediation,
        cvss: v.cvss,
        cveIds: v.cveIds,
        references: v.references,
      })),
    );
    counts.vulnerabilities += vulns.length;
  };

  try {
    await db
      .update(scans)
      .set({ status: 'running', stage: 'start', startedAt: new Date() })
      .where(eq(scans.id, input.scanId));

    // Idempotency: pg-boss is at-least-once, so a re-delivered job must not duplicate result rows.
    // Wipe this scan's previous active-pipeline output before re-inserting (passive tables upsert).
    await Promise.all([
      db.delete(subdomains).where(eq(subdomains.scanId, input.scanId)),
      db.delete(endpoints).where(eq(endpoints.scanId, input.scanId)),
      db.delete(portsTable).where(eq(portsTable.scanId, input.scanId)),
      db.delete(vulnerabilities).where(eq(vulnerabilities.scanId, input.scanId)),
      db.delete(commands).where(eq(commands.scanId, input.scanId)),
    ]);

    // Stage 1 - subdomains (skipped when predefined list provided).
    let hosts: string[] = [];
    if (input.predefinedSubdomains?.length) {
      hosts = input.predefinedSubdomains;
      await activity('subfinder', 'skipped', 'predefined subdomains provided');
    } else if (input.profile.tools.subfinder !== false) {
      await activity('subfinder', 'running');
      const args = subfinderArgs(input.domain);
      const r = await runTool({ bin: 'subfinder', args, timeoutMs, signal: input.signal });
      await record('subfinder', args, r);
      const subs = r.lines.map(parseSubfinderLine).flatMap((s) => (s ? [s] : []));
      hosts = subs.map((s) => s.host);
      if (subs.length)
        await db.insert(subdomains).values(subs.map((s) => ({ scanId: input.scanId, host: s.host, source: s.source })));
      counts.subdomains = subs.length;
      await activity('subfinder', stageStatus(r), stageNote(r, `${subs.length} subdomains`));
    }
    if (!hosts.length) hosts = [input.domain];
    // Drop profile-excluded subdomains before probing.
    if (excluded.size) hosts = hosts.filter((h) => !excluded.has(h.toLowerCase()));
    if (!hosts.length) hosts = [input.domain];

    // Stage 2 - httpx probe + WordPress detection.
    checkAbort();
    const live: { url: string; host: string; isWp: boolean }[] = [];
    if (input.profile.tools.httpx !== false) {
      await activity('httpx', 'running');
      const args = httpxArgs(reqHeaders, {
        userAgent: httpxCfg.userAgent,
        rateLimit: httpxCfg.rateLimit,
        threads: httpxCfg.concurrency,
      });
      const r = await runTool({ bin: 'httpx', args, input: hosts.join('\n') + '\n', timeoutMs, signal: input.signal });
      await record('httpx', args, r);
      const results = r.lines.map(parseHttpxLine).flatMap((x) => (x ? [x] : []));
      if (results.length) {
        await db.insert(endpoints).values(
          results.map((h) => ({
            scanId: input.scanId,
            url: h.url,
            host: h.host,
            port: h.port,
            scheme: h.scheme,
            title: h.title,
            webServer: h.webServer,
            statusCode: h.statusCode,
            contentLength: h.contentLength,
            tech: h.tech,
            isWordpress: isWordPress(h) ? 1 : 0,
            isInteresting: isInterestingEndpoint(
              h.url,
              h.title,
              cfg.interestingKeywords?.length ? cfg.interestingKeywords : undefined,
            ),
          })),
        );
      }
      for (const h of results) live.push({ url: h.url, host: h.host, isWp: isWordPress(h) });
      counts.endpoints = results.length;
      await activity('httpx', stageStatus(r), stageNote(r, `${results.length} live endpoints`));
    }

    // Stage 3 - naabu port scan.
    checkAbort();
    if (input.profile.tools.naabu !== false) {
      await activity('naabu', 'running');
      const scanHosts = [...new Set((live.length ? live.map((e) => e.host) : hosts).filter(Boolean))];
      let naabuTimeouts = 0;
      for (const host of scanHosts) {
        const args = naabuArgs(host, input.profile.ports);
        const r = await runTool({ bin: 'naabu', args, timeoutMs, signal: input.signal });
        if (r.timedOut) naabuTimeouts++;
        await record('naabu', args, r);
        const seen = new Set<string>();
        const ps = r.lines
          .map(parseNaabuLine)
          .flatMap((p) => (p ? [p] : []))
          .filter((p) => {
            const key = `${p.ip}:${p.port}:${p.protocol}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        if (ps.length)
          await db
            .insert(portsTable)
            .values(ps.map((p) => ({ scanId: input.scanId, ip: p.ip, port: p.port, protocol: p.protocol })));
        counts.ports += ps.length;
      }
      await activity(
        'naabu',
        naabuTimeouts ? 'failed' : 'completed',
        naabuTimeouts
          ? `${counts.ports} open ports (${naabuTimeouts}/${scanHosts.length} host(s) timed out, partial results)`
          : `${counts.ports} open ports`,
      );
    }

    // Stage 4 - nuclei.
    checkAbort();
    if (input.profile.tools.nuclei !== false && live.length) {
      await activity('nuclei', 'running');
      const args = nucleiArgs({
        severities: input.profile.severities,
        tags: nucleiCfg.tags,
        templates: nucleiCfg.templates,
        excludeTags: nucleiCfg.excludeTags,
        headers: reqHeaders,
        userAgent: nucleiCfg.userAgent,
        rateLimit: nucleiCfg.rateLimit,
        concurrency: nucleiCfg.concurrency,
        retries: nucleiCfg.retries,
        extraArgs: nucleiCfg.extraArgs,
      });
      const r = await runTool({
        bin: 'nuclei',
        args,
        input: live.map((e) => e.url).join('\n') + '\n',
        timeoutMs,
        signal: input.signal,
      });
      await record('nuclei', args, r);
      await insertVulns(r.lines.map(parseNucleiLine).flatMap((v) => (v ? [v] : [])));
      // A nuclei timeout with partial findings is still a valid result, so don't mark the stage failed.
      const nucleiStatus = r.timedOut && counts.vulnerabilities > 0 ? 'completed' : stageStatus(r);
      await activity('nuclei', nucleiStatus, stageNote(r, `${counts.vulnerabilities} findings`));
    }

    // Stage 4b - wordfence: WordPress-focused nuclei templates on detected WP hosts. Runs
    // independently of the main nuclei toggle, so a profile can run wordfence with nuclei off.
    checkAbort();
    const wpUrls = live.filter((e) => e.isWp).map((e) => e.url);
    if (input.profile.tools.wordfence !== false && wpUrls.length) {
      await activity('wordfence', 'running', `${wpUrls.length} WordPress host(s)`);
      const wargs = nucleiArgs({ tags: ['wordpress'] });
      const wr = await runTool({
        bin: 'nuclei',
        args: wargs,
        input: wpUrls.join('\n') + '\n',
        timeoutMs,
        signal: input.signal,
      });
      await record('nuclei', wargs, wr);
      await insertVulns(wr.lines.map(parseNucleiLine).flatMap((v) => (v ? [v] : [])));
      await activity('wordfence', stageStatus(wr));
    }

    await db
      .update(scans)
      .set({ status: 'completed', stage: 'done', finishedAt: new Date(), counts: mergedCounts() })
      .where(eq(scans.id, input.scanId));
    await activity('done', 'completed');
  } catch (err) {
    const aborted = input.signal?.aborted ?? false;
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(scans)
      .set({ status: aborted ? 'cancelled' : 'failed', finishedAt: new Date(), error: message, counts: mergedCounts() })
      .where(eq(scans.id, input.scanId));
    await activity('done', aborted ? 'cancelled' : 'failed', message);
    if (!aborted) throw err;
  }
}
