'use server';

import { revalidatePath } from 'next/cache';
import { Permission } from '@vacti/core';

// These actions are invoked from <ActionForm> (a client transition that calls the action then
// router.refresh()). They must NOT redirect (that would be swallowed by the form's catch); they just
// mutate + revalidate so the follow-up refresh re-renders with the persisted state.
function backToIntegrations(): void {
  revalidatePath('/settings/integrations');
}
import {
  setProjectSecret,
  clearProjectSecret,
  getProjectSecret,
  setProjectSecretCheck,
  validateProviderKey,
  SECRET_NAMES,
} from '@vacti/integrations';
import { getDb, env } from './db';
import { requirePermission } from './authz';
import { requireProjectMember } from './tenancy';
import { recordAudit } from './audit';

/** Store an encrypted per-project API key (OTX / LeakCheck / AI). SysAdmin only. */
export async function saveProjectKeyAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '');
  const value = String(formData.get('value') ?? '').trim();
  if (!projectId || !(SECRET_NAMES as readonly string[]).includes(name) || !value) return;
  await requireProjectMember(actor, projectId);
  await setProjectSecret(getDb(), projectId, name, value, env().ENCRYPTION_KEY);
  // Audit the fact a key was set - never the value.
  await recordAudit({
    actorId: actor.id,
    action: 'vault.key_set',
    resource: `key:${name}`,
    projectId,
    metadata: { name },
  });
  backToIntegrations();
}

/** Probe a stored API key against its provider and persist the verdict in place. SysAdmin only. */
export async function testProjectKeyAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '');
  if (!projectId || !(SECRET_NAMES as readonly string[]).includes(name)) return;
  await requireProjectMember(actor, projectId);

  const key = await getProjectSecret(getDb(), projectId, name, env().ENCRYPTION_KEY);
  const result = key
    ? await validateProviderKey(name, key)
    : ({ status: 'invalid', message: 'No key stored.' } as const);

  // Persist the verdict so the status badge survives reloads/navigation.
  if (key) await setProjectSecretCheck(getDb(), projectId, name, result.status);
  await recordAudit({
    actorId: actor.id,
    action: 'vault.key_test',
    resource: `key:${name}`,
    projectId,
    metadata: { name, status: result.status },
  });
  // The verdict is persisted; navigate back so the sticky status badge re-renders.
  backToIntegrations();
}

export async function clearProjectKeyAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '');
  if (!projectId || !name) return;
  await requireProjectMember(actor, projectId);
  await clearProjectSecret(getDb(), projectId, name);
  await recordAudit({
    actorId: actor.id,
    action: 'vault.key_clear',
    resource: `key:${name}`,
    projectId,
    metadata: { name },
  });
  backToIntegrations();
}
