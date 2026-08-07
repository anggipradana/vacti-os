'use server';

import { revalidatePath } from 'next/cache';
import { eq, ne } from 'drizzle-orm';
import { Permission } from '@vacti/core';
import { appBranding } from '@vacti/db';
import { getDb } from './db';
import { requirePermission } from './authz';
import { recordAudit } from './audit';

const MAX_LOGO_BYTES = 512 * 1024; // 512KB - a logo, embedded as a data URI in every page
const ALLOWED_LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];

/** Read an uploaded logo File into a self-contained data: URI (size + type validated). Returns null if no file. */
async function logoToDataUri(file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) throw new Error('Logo must be SVG, PNG, JPEG, or WebP');
  if (file.size > MAX_LOGO_BYTES) throw new Error('Logo must be 512KB or smaller');
  const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  return `data:${file.type};base64,${b64}`;
}

/** Make exactly one preset active (the partial unique index allows a single is_active=true row). */
async function activateOnly(id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.update(appBranding).set({ isActive: false }).where(ne(appBranding.id, id));
    await tx.update(appBranding).set({ isActive: true, updatedAt: new Date() }).where(eq(appBranding.id, id));
  });
}

/**
 * Create a new branding preset or update an existing one (name + logo). With `activate` on, it also becomes
 * the live brand. RBAC (ModifySystemConfig) + audited. The logo is embedded as a data URI; leaving the file
 * empty on an update keeps the current logo.
 */
export async function saveBrandingPresetAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim() || 'Untitled brand';
  const appName = String(formData.get('appName') ?? '').trim();
  const activate = String(formData.get('activate') ?? '') === 'on';
  if (!appName) return;
  const logoDataUri = await logoToDataUri(formData.get('logo'));

  const db = getDb();
  let targetId = id;
  if (id) {
    // keep the existing logo when no new file was uploaded
    await db
      .update(appBranding)
      .set({ label, appName, ...(logoDataUri ? { logoDataUri } : {}), updatedAt: new Date() })
      .where(eq(appBranding.id, id));
  } else {
    const [row] = await db
      .insert(appBranding)
      .values({ label, appName, logoDataUri })
      .returning({ id: appBranding.id });
    targetId = row!.id;
  }
  if (activate && targetId) await activateOnly(targetId);
  await recordAudit({ actorId: actor.id, action: 'branding.save', resource: `branding:${targetId}` });
  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout');
}

/** Apply a preset (make it the live brand). RBAC + audited. */
export async function activateBrandingPresetAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await activateOnly(id);
  await recordAudit({ actorId: actor.id, action: 'branding.activate', resource: `branding:${id}` });
  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout');
}

/** Delete a preset. The built-in default is protected (it is the revert target); if the active preset is
 *  deleted, the default becomes active again. RBAC + audited. */
export async function deleteBrandingPresetAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  const db = getDb();
  const [row] = await db.select().from(appBranding).where(eq(appBranding.id, id)).limit(1);
  if (!row || row.isDefault) return; // never delete the built-in default
  await db.delete(appBranding).where(eq(appBranding.id, id));
  if (row.isActive) {
    const [def] = await db.select({ id: appBranding.id }).from(appBranding).where(eq(appBranding.isDefault, true));
    if (def) await activateOnly(def.id);
  }
  await recordAudit({ actorId: actor.id, action: 'branding.delete', resource: `branding:${id}` });
  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout');
}

/** Revert the live brand to the built-in default (vacti). RBAC + audited. */
export async function revertBrandingAction(): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const [def] = await getDb().select({ id: appBranding.id }).from(appBranding).where(eq(appBranding.isDefault, true));
  if (def) await activateOnly(def.id);
  await recordAudit({ actorId: actor.id, action: 'branding.revert', resource: 'branding' });
  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout');
}
