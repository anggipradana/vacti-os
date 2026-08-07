'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Permission } from '@vacti/core';
import { networkSettings } from '@vacti/db';
import { isValidProxyUrl, redactProxyUrl } from '@vacti/recon';
import { getDb } from './db';
import { requirePermission } from './authz';
import { recordAudit } from './audit';

/**
 * Save the app-level outbound proxy URL used by the worker for OSINT/deep-fetch traffic. Empty clears it
 * (proxy disabled). The URL is validated server-side against the SAME schemes makeProxyDispatcher accepts
 * (http/https/socks4/socks5); an unsupported scheme is rejected with a form error. RBAC (ModifySystemConfig)
 * + audited. The proxy value may carry credentials, so it is never logged in full - only scheme+host.
 */
export async function saveNetworkProxyAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const raw = String(formData.get('proxyUrl') ?? '').trim();
  // Reject an unsupported scheme (empty is allowed - it disables the proxy).
  if (raw && !isValidProxyUrl(raw)) redirect('/settings/network?error=scheme');
  const proxyUrl = raw || null;

  await getDb()
    .insert(networkSettings)
    .values({ id: 'default', proxyUrl, updatedAt: new Date() })
    .onConflictDoUpdate({ target: networkSettings.id, set: { proxyUrl, updatedAt: new Date() } });

  await recordAudit({
    actorId: actor.id,
    action: proxyUrl ? 'network.proxy_set' : 'network.proxy_clear',
    resource: 'network:proxy',
    // Never store the full URL (may contain user:pass) - only the redacted scheme+host.
    metadata: proxyUrl ? { proxy: redactProxyUrl(proxyUrl) } : {},
  });

  revalidatePath('/settings/network');
  redirect('/settings/network?saved=1');
}
