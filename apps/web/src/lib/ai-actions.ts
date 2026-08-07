'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { Permission } from '@vacti/core';
import {
  enrichVulnerability,
  enrichmentHash,
  generateThreatNarrative,
  resolveAiModel,
  validateProviderKey,
} from '@vacti/integrations';
import { encryptSecret, decryptSecret } from '@vacti/auth';
import { computeProjectRisk } from '@vacti/threat-intel';
import {
  vulnerabilities,
  aiSettings,
  aiDefaults,
  aiCache,
  threatIntelStatus,
  otxThreatData,
  leakcheckData,
  projects,
} from '@vacti/db';
import { getDb, env } from './db';
import { requirePermission } from './authz';
import { requireProjectMember, requireScanMember } from './tenancy';
import { recordAudit } from './audit';
import { providerFor, AI_PROVIDERS, type AiProviderName } from './ai-provider';

export async function enrichVulnAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const scanId = String(formData.get('scanId') ?? '');
  const db = getDb();
  const [vuln] = await db.select().from(vulnerabilities).where(eq(vulnerabilities.id, id));
  if (!vuln) return;
  // The vuln's own scan is authoritative for tenancy (form scanId is only used for revalidation).
  const scan = await requireScanMember(user, vuln.scanId);
  const provider = await providerFor(scan.projectId);
  if (!provider) {
    // No AI key configured - degrade gracefully (no-op).
    if (scanId) revalidatePath(`/scans/${scanId}`);
    return;
  }
  const input = { name: vuln.name, type: vuln.type, matchedAt: vuln.matchedAt, severity: vuln.severity };
  const hash = enrichmentHash(input);
  const [cached] = await db.select().from(aiCache).where(eq(aiCache.hash, hash));
  let enrichment;
  if (cached) {
    enrichment = JSON.parse(cached.output) as { description: string; impact: string; remediation: string };
  } else {
    enrichment = await enrichVulnerability(input, provider);
    await db
      .insert(aiCache)
      .values({ hash, kind: 'vuln', output: JSON.stringify(enrichment) })
      .onConflictDoNothing();
  }
  await db
    .update(vulnerabilities)
    .set({
      aiDescription: enrichment.description,
      aiImpact: enrichment.impact,
      aiRemediation: enrichment.remediation,
      isAiEnriched: true,
    })
    .where(eq(vulnerabilities.id, id));
  if (scanId) revalidatePath(`/scans/${scanId}`);
}

export async function saveAiSettingsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  await requireProjectMember(user, projectId);
  const provider = String(formData.get('provider') ?? 'openai');
  // Empty provider = "use system default": drop the per-project override so it follows ai_defaults.
  if (provider === '') {
    await getDb().delete(aiSettings).where(eq(aiSettings.projectId, projectId));
    revalidatePath('/settings/integrations');
    return;
  }
  const model = resolveAiModel(provider, String(formData.get('model') ?? ''));
  const rawBaseUrl = String(formData.get('baseUrl') ?? '').trim();
  // Optional override endpoint; must be a valid http(s) URL when present, else store null (vendor default).
  const baseUrl = rawBaseUrl && /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : null;
  if (!AI_PROVIDERS.includes(provider as AiProviderName)) return;
  await getDb()
    .insert(aiSettings)
    .values({ projectId, provider, model, baseUrl })
    .onConflictDoUpdate({ target: aiSettings.projectId, set: { provider, model, baseUrl } });
  revalidatePath('/settings/integrations');
}

/** Save the system-wide default AI enrichment config (used by projects without their own setting). */
export async function saveAiDefaultsAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const provider = String(formData.get('provider') ?? 'openai');
  const model = resolveAiModel(provider, String(formData.get('model') ?? ''));
  const rawBaseUrl = String(formData.get('baseUrl') ?? '').trim();
  const baseUrl = rawBaseUrl && /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : null;
  if (!AI_PROVIDERS.includes(provider as AiProviderName)) return;

  // Optional system API key: works across ALL projects (fallback when a project's vault has no key
  // for the default provider). Blank keeps the stored key; the clearKey checkbox removes it.
  const rawKey = String(formData.get('apiKey') ?? '').trim();
  const clearKey = formData.get('clearKey') === 'on';
  const set: Record<string, unknown> = { provider, model, baseUrl, updatedAt: new Date() };
  if (clearKey) {
    set.apiKeyCiphertext = null;
    set.lastCheckStatus = null;
    set.lastCheckedAt = null;
  } else if (rawKey) {
    set.apiKeyCiphertext = encryptSecret(rawKey, env().ENCRYPTION_KEY);
  }
  // Persist config + key FIRST so the page reload right after submit already shows them; the
  // validity probe (network, up to 12s) lands in a second write below.
  const db = getDb();
  await db
    .insert(aiDefaults)
    .values({ id: 'default', ...set })
    .onConflictDoUpdate({ target: aiDefaults.id, set });
  if (rawKey && !clearKey) {
    // Validate on save so the badge is meaningful without a separate Test click (and persists).
    const result = await validateProviderKey(provider, rawKey);
    await db
      .update(aiDefaults)
      .set({ lastCheckStatus: result.status, lastCheckedAt: new Date() })
      .where(eq(aiDefaults.id, 'default'));
  }
  if (clearKey || rawKey) {
    await recordAudit({
      actorId: actor.id,
      action: clearKey ? 'ai.default_key_clear' : 'ai.default_key_set',
      resource: `ai-default:${provider}`,
      metadata: { provider },
    });
  }
  revalidatePath('/settings/integrations');
}

/**
 * Re-validate the STORED system API key against the provider without re-entering it (the operator asked
 * to be able to CHECK a saved key). Decrypts server-side, probes the provider, persists the verdict so
 * the badge reflects the live result. No-op if no key is stored.
 */
export async function testAiDefaultAction() {
  await requirePermission(Permission.ModifySystemConfig);
  const db = getDb();
  const [row] = await db.select().from(aiDefaults).where(eq(aiDefaults.id, 'default'));
  if (!row?.apiKeyCiphertext) {
    revalidatePath('/settings/integrations');
    return;
  }
  let status: 'valid' | 'invalid' | 'error' = 'error';
  try {
    const key = decryptSecret(row.apiKeyCiphertext, env().ENCRYPTION_KEY);
    status = (await validateProviderKey(row.provider ?? 'openai', key)).status;
  } catch {
    status = 'error';
  }
  await db
    .update(aiDefaults)
    .set({ lastCheckStatus: status, lastCheckedAt: new Date() })
    .where(eq(aiDefaults.id, 'default'));
  revalidatePath('/settings/integrations');
}

/** G8 - generate the threat-intelligence narrative for a project, store on the TI status row. */
export async function generateThreatNarrativeAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const lang = String(formData.get('lang') ?? 'en') === 'id' ? 'id' : 'en';
  if (!projectId) return;
  await requireProjectMember(user, projectId);
  const db = getDb();
  const provider = await providerFor(projectId);
  if (!provider) {
    revalidatePath('/threat');
    return;
  }
  const [risk, otx, leaks, [project]] = await Promise.all([
    computeProjectRisk(db, projectId),
    db.select().from(otxThreatData).where(eq(otxThreatData.projectId, projectId)),
    db.select().from(leakcheckData).where(eq(leakcheckData.projectId, projectId)),
    db.select().from(projects).where(eq(projects.id, projectId)),
  ]);
  const score = Math.max(0, Math.min(100, risk.score));
  const narrative = await generateThreatNarrative(
    {
      project: project?.name ?? 'project',
      lang,
      riskScore: score,
      riskLevel: score >= 71 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW',
      totals: {
        pulses: otx.reduce((a, o) => a + o.pulses, 0),
        malware: otx.reduce((a, o) => a + o.malwareCount, 0),
        leaks: leaks.length,
      },
      components: risk.components,
    },
    provider,
  );
  await db
    .insert(threatIntelStatus)
    .values({ projectId, aiNarrative: narrative })
    .onConflictDoUpdate({ target: threatIntelStatus.projectId, set: { aiNarrative: narrative } });
  revalidatePath('/threat');
}
