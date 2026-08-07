'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Permission, isValidCron, buildCron, type ScheduleFrequency } from '@vacti/core';
import { targets, scans, scanSchedules, reconNotes, scanProfiles } from '@vacti/db';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { requirePermission } from './authz';
import { requireProjectMember, requireScanMember } from './tenancy';
import { recordAudit } from './audit';
import { normalizeDomain } from './validate';

type Actor = Parameters<typeof requireProjectMember>[0];

/** Resolve a target -> its project and assert membership (SysAdmin bypasses; 404 for a non-member). */
async function requireTargetMember(user: Actor, targetId: string): Promise<void> {
  const [t] = await getDb().select({ projectId: targets.projectId }).from(targets).where(eq(targets.id, targetId));
  await requireProjectMember(user, t?.projectId);
}

/** Resolve a schedule -> its target -> project and assert membership (SysAdmin bypasses; 404 otherwise). */
async function requireScheduleMember(user: Actor, scheduleId: string): Promise<void> {
  const [s] = await getDb()
    .select({ targetId: scanSchedules.targetId })
    .from(scanSchedules)
    .where(eq(scanSchedules.id, scheduleId));
  if (!s) return requireProjectMember(user, undefined);
  await requireTargetMember(user, s.targetId);
}

/** Resolve a recon note -> its target -> project and assert membership (SysAdmin bypasses; 404 otherwise). */
async function requireNoteMember(user: Actor, noteId: string): Promise<void> {
  const [n] = await getDb().select({ targetId: reconNotes.targetId }).from(reconNotes).where(eq(reconNotes.id, noteId));
  if (!n) return requireProjectMember(user, undefined);
  await requireTargetMember(user, n.targetId);
}

/** Split a textarea/CSV field into a trimmed string[] (空 → []). */
function list(v: FormDataEntryValue | null): string[] {
  return String(v ?? '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const num = (v: FormDataEntryValue | null): number | undefined => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const ALL_TOOL_KEYS = ['subfinder', 'httpx', 'naabu', 'nuclei', 'wordfence'] as const;
const ALL_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

/** Create a scan profile with advanced per-tool config (modify_scan_config). */
export async function saveProfileAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanConfig);
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/settings/profiles?error=invalid');
  const picked = new Set(formData.getAll('tools').map(String));
  const tools = Object.fromEntries(ALL_TOOL_KEYS.map((t) => [t, picked.has(t)]));
  const sev = formData.getAll('severities').map(String).filter(Boolean);
  const config: Record<string, unknown> = {};

  // httpx - its own probe options.
  const httpx: Record<string, unknown> = {};
  const hua = String(formData.get('httpxUserAgent') ?? '').trim();
  if (hua) httpx.userAgent = hua;
  const hrate = num(formData.get('httpxRateLimit'));
  if (hrate) httpx.rateLimit = hrate;
  const hconc = num(formData.get('httpxConcurrency'));
  if (hconc) httpx.concurrency = hconc;
  if (Object.keys(httpx).length) config.httpx = httpx;

  // nuclei - its own scan options.
  const nuclei: Record<string, unknown> = {};
  const nua = String(formData.get('nucleiUserAgent') ?? '').trim();
  if (nua) nuclei.userAgent = nua;
  const nrate = num(formData.get('nucleiRateLimit'));
  if (nrate) nuclei.rateLimit = nrate;
  const nconc = num(formData.get('nucleiConcurrency'));
  if (nconc) nuclei.concurrency = nconc;
  const nret = num(formData.get('nucleiRetries'));
  if (nret !== undefined) nuclei.retries = nret;
  const nt = list(formData.get('nucleiTags'));
  if (nt.length) nuclei.tags = nt;
  const ntpl = list(formData.get('nucleiTemplates'));
  if (ntpl.length) nuclei.templates = ntpl;
  const net = list(formData.get('nucleiExcludeTags'));
  if (net.length) nuclei.excludeTags = net;
  const extra = list(formData.get('nucleiExtraArgs'));
  if (extra.length) nuclei.extraArgs = extra;
  if (Object.keys(nuclei).length) config.nuclei = nuclei;

  // Scope (applies across tools).
  const ex = list(formData.get('excludeSubdomains'));
  if (ex.length) config.excludeSubdomains = ex;

  // Keep the legacy top-level `rate` column in sync (httpx rate is the headline throughput).
  const rate = hrate ?? nrate;
  await getDb()
    .insert(scanProfiles)
    .values({
      name,
      tools,
      ports: String(formData.get('ports') ?? 'top-100').trim() || 'top-100',
      severities: sev.length ? sev : [...ALL_SEVERITIES.slice(0, 4)],
      rate: rate ?? null,
      config: Object.keys(config).length ? config : null,
    });
  await recordAudit({ actorId: actor.id, action: 'profile.create', resource: `profile:${name}` });
  revalidatePath('/settings/profiles');
}

/** Update a scan profile - mirrors saveProfileAction's field set (modify_scan_config). */
export async function editProfileAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanConfig);
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!id || !name) redirect('/settings/profiles?error=invalid');
  const picked = new Set(formData.getAll('tools').map(String));
  const tools = Object.fromEntries(ALL_TOOL_KEYS.map((t) => [t, picked.has(t)]));
  const sev = formData.getAll('severities').map(String).filter(Boolean);
  const config: Record<string, unknown> = {};

  // httpx - its own probe options.
  const httpx: Record<string, unknown> = {};
  const hua = String(formData.get('httpxUserAgent') ?? '').trim();
  if (hua) httpx.userAgent = hua;
  const hrate = num(formData.get('httpxRateLimit'));
  if (hrate) httpx.rateLimit = hrate;
  const hconc = num(formData.get('httpxConcurrency'));
  if (hconc) httpx.concurrency = hconc;
  if (Object.keys(httpx).length) config.httpx = httpx;

  // nuclei - its own scan options.
  const nuclei: Record<string, unknown> = {};
  const nua = String(formData.get('nucleiUserAgent') ?? '').trim();
  if (nua) nuclei.userAgent = nua;
  const nrate = num(formData.get('nucleiRateLimit'));
  if (nrate) nuclei.rateLimit = nrate;
  const nconc = num(formData.get('nucleiConcurrency'));
  if (nconc) nuclei.concurrency = nconc;
  const nret = num(formData.get('nucleiRetries'));
  if (nret !== undefined) nuclei.retries = nret;
  const nt = list(formData.get('nucleiTags'));
  if (nt.length) nuclei.tags = nt;
  const ntpl = list(formData.get('nucleiTemplates'));
  if (ntpl.length) nuclei.templates = ntpl;
  const net = list(formData.get('nucleiExcludeTags'));
  if (net.length) nuclei.excludeTags = net;
  const extra = list(formData.get('nucleiExtraArgs'));
  if (extra.length) nuclei.extraArgs = extra;
  if (Object.keys(nuclei).length) config.nuclei = nuclei;

  // Scope (applies across tools).
  const ex = list(formData.get('excludeSubdomains'));
  if (ex.length) config.excludeSubdomains = ex;

  const rate = hrate ?? nrate;
  await getDb()
    .update(scanProfiles)
    .set({
      name,
      tools,
      ports: String(formData.get('ports') ?? 'top-100').trim() || 'top-100',
      severities: sev.length ? sev : [...ALL_SEVERITIES.slice(0, 4)],
      rate: rate ?? null,
      config: Object.keys(config).length ? config : null,
    })
    .where(eq(scanProfiles.id, id));
  await recordAudit({ actorId: actor.id, action: 'profile.update', resource: `profile:${id}` });
  revalidatePath('/settings/profiles');
}

export async function deleteProfileAction(formData: FormData) {
  await requirePermission(Permission.ModifyScanConfig);
  const id = String(formData.get('id') ?? '');
  if (id) await getDb().delete(scanProfiles).where(eq(scanProfiles.id, id));
  revalidatePath('/settings/profiles');
}

/** Parse "Key: value" lines into a headers object (ignores blank/malformed lines). */
function parseHeaders(raw: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Where to send the operator after a target mutation. The shared <TargetsManager> lives inside both
 * /scans and /threat (target management is no longer a standalone page), so each form posts a
 * `returnTo` of the host page; default to /scans for legacy callers. Only allow same-origin paths.
 */
function targetReturnTo(formData: FormData): string {
  const raw = String(formData.get('returnTo') ?? '').trim();
  return raw.startsWith('/') ? raw : '/scans';
}

export async function createTargetAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const back = targetReturnTo(formData);
  const projectId = String(formData.get('projectId') ?? '');
  // Normalize + validate: a pasted URL/garbage ("http://x.com:8080/p", "not a domain") would
  // otherwise be fed verbatim to subfinder/httpx and silently yield zero results.
  const domain = normalizeDomain(String(formData.get('domain') ?? ''));
  const subsRaw = String(formData.get('predefinedSubdomains') ?? '').trim();
  const headersRaw = String(formData.get('customHeaders') ?? '').trim();
  if (!projectId || !domain) redirect(`${back}?error=invalid`);
  await requireProjectMember(user, projectId);
  const predefinedSubdomains = subsRaw
    ? subsRaw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const customHeaders = headersRaw ? parseHeaders(headersRaw) : null;
  await getDb().insert(targets).values({ projectId, domain, predefinedSubdomains, customHeaders });
  revalidatePath(back);
}

/** Update a target's domain, predefined subdomains and custom headers. ModifyTargets + audit. */
export async function editTargetAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyTargets);
  const back = targetReturnTo(formData);
  const id = String(formData.get('id') ?? '');
  const domain = normalizeDomain(String(formData.get('domain') ?? ''));
  const subsRaw = String(formData.get('predefinedSubdomains') ?? '').trim();
  const headersRaw = String(formData.get('customHeaders') ?? '').trim();
  if (!id || !domain) redirect(`${back}?error=invalid`);
  await requireTargetMember(actor, id);
  const predefinedSubdomains = subsRaw
    ? subsRaw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const customHeaders = headersRaw ? parseHeaders(headersRaw) : null;
  await getDb().update(targets).set({ domain, predefinedSubdomains, customHeaders }).where(eq(targets.id, id));
  await recordAudit({ actorId: actor.id, action: 'target.update', resource: `target:${id}` });
  revalidatePath(back);
}

/** Delete a target and its scans/results (cascade via FK). ModifyTargets + audit. */
export async function deleteTargetAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireTargetMember(actor, id);
  await getDb().delete(targets).where(eq(targets.id, id));
  await recordAudit({ actorId: actor.id, action: 'target.delete', resource: `target:${id}` });
  revalidatePath(targetReturnTo(formData));
}

/** Delete a scan and all its results (cascade via FK). InitiateScans + audit. */
export async function deleteScanAction(formData: FormData) {
  const actor = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireScanMember(actor, id);
  await getDb().delete(scans).where(eq(scans.id, id));
  await recordAudit({ actorId: actor.id, action: 'scan.delete', resource: `scan:${id}` });
  redirect('/scans');
}

/** Request cancellation of a running/queued scan (worker polls the flag and aborts). */
export async function cancelScanAction(formData: FormData) {
  const actor = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = getDb();
  const [scan] = await db.select().from(scans).where(eq(scans.id, id));
  if (!scan || ['completed', 'failed', 'cancelled'].includes(scan.status)) return;
  await requireProjectMember(actor, scan.projectId);
  await recordAudit({ actorId: actor.id, action: 'scan.cancel', resource: `scan:${id}`, projectId: scan.projectId });
  if (scan.status === 'queued') {
    await db
      .update(scans)
      .set({ status: 'cancelled', cancelRequested: true, finishedAt: new Date() })
      .where(eq(scans.id, id));
  } else {
    await db.update(scans).set({ cancelRequested: true }).where(eq(scans.id, id));
  }
  revalidatePath(`/scans/${id}`);
}

// Rescan moved to the plain-fetch route app/api/internal/rescan (the heavy scan-detail page drops
// the server action's redirect response). Tool/mode/deepScan carry-over lives there.

export async function createScheduleAction(formData: FormData) {
  const user = await requirePermission(Permission.InitiateScans);
  const targetId = String(formData.get('targetId') ?? '');
  const profileId = String(formData.get('profileId') ?? '').trim() || null;
  // Build the cron from the friendly schedule pickers (frequency + time + day).
  const freq = String(formData.get('freq') ?? 'daily') as ScheduleFrequency;
  const [hh, mm] = String(formData.get('time') ?? '02:00').split(':');
  const cron = buildCron({
    freq,
    hour: Number(hh) || 0,
    minute: Number(mm) || 0,
    dow: Number(formData.get('dow') ?? 1),
    dom: Number(formData.get('dom') ?? 1),
  });
  if (!targetId || !isValidCron(cron)) redirect('/settings/schedules?error=invalid');
  await requireTargetMember(user, targetId);
  await getDb().insert(scanSchedules).values({ targetId, cron, profileId });
  revalidatePath('/settings/schedules');
}

/** Update a schedule's cron, profile and enabled flag. InitiateScans + audit. */
export async function editScheduleAction(formData: FormData) {
  const actor = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  const cron = String(formData.get('cron') ?? '').trim();
  const profileId = String(formData.get('profileId') ?? '').trim() || null;
  const enabled = String(formData.get('enabled') ?? '') === '1';
  if (!id || !isValidCron(cron)) redirect('/settings/schedules?error=invalid');
  await requireScheduleMember(actor, id);
  await getDb().update(scanSchedules).set({ cron, profileId, enabled }).where(eq(scanSchedules.id, id));
  await recordAudit({ actorId: actor.id, action: 'schedule.update', resource: `schedule:${id}` });
  revalidatePath('/settings/schedules');
}

export async function toggleScheduleAction(formData: FormData) {
  const user = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireScheduleMember(user, id);
  const [row] = await getDb().select().from(scanSchedules).where(eq(scanSchedules.id, id));
  if (row) await getDb().update(scanSchedules).set({ enabled: !row.enabled }).where(eq(scanSchedules.id, id));
  revalidatePath('/settings/schedules');
}

export async function deleteScheduleAction(formData: FormData) {
  const user = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireScheduleMember(user, id);
  await getDb().delete(scanSchedules).where(eq(scanSchedules.id, id));
  revalidatePath('/settings/schedules');
}

// ---- Recon notes / TODOs (per target) ----
export async function addNoteAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const targetId = String(formData.get('targetId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!targetId || !body) return;
  await requireTargetMember(user, targetId);
  await getDb().insert(reconNotes).values({ targetId, body });
  revalidatePath(`/targets/${targetId}`);
}

export async function editNoteAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!id || !body) return;
  await requireNoteMember(user, id);
  await getDb().update(reconNotes).set({ body }).where(eq(reconNotes.id, id));
  if (targetId) revalidatePath(`/targets/${targetId}`);
}

export async function toggleNoteAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  if (!id) return;
  await requireNoteMember(user, id);
  const [row] = await getDb().select().from(reconNotes).where(eq(reconNotes.id, id));
  if (row) await getDb().update(reconNotes).set({ done: !row.done }).where(eq(reconNotes.id, id));
  if (targetId) revalidatePath(`/targets/${targetId}`);
}

export async function deleteNoteAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  if (!id) return;
  await requireNoteMember(user, id);
  await getDb().delete(reconNotes).where(eq(reconNotes.id, id));
  if (targetId) revalidatePath(`/targets/${targetId}`);
}
