'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { Permission } from '@vacti/core';
import { webhooks } from '@vacti/db';
import { dispatchWebhook, type Channel } from '@vacti/integrations';
import { getDb } from './db';
import { requirePermission } from './authz';
import { requireProjectMember } from './tenancy';

/** Webhook destinations must be real http(s) URLs; anything else is stored as null (no dispatch). */
function validHttpUrl(s: string | null): string | null {
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

export async function addWebhookAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const channel = String(formData.get('channel') ?? 'discord');
  if (!projectId || !['discord', 'slack', 'telegram', 'google_chat', 'generic'].includes(channel)) return;
  await requireProjectMember(user, projectId);
  const v = (k: string) => {
    const s = String(formData.get(k) ?? '').trim();
    return s || null;
  };
  await getDb()
    .insert(webhooks)
    .values({
      projectId,
      channel,
      label: v('label'),
      url: validHttpUrl(v('url')),
      telegramToken: v('telegramToken'),
      telegramChatId: v('telegramChatId'),
      events: formData.getAll('events').map(String),
      enabled: true,
    });
  revalidatePath('/settings/integrations');
}

export async function editWebhookAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  const channel = String(formData.get('channel') ?? 'discord');
  if (!id || !['discord', 'slack', 'telegram', 'google_chat', 'generic'].includes(channel)) return;
  const [target] = await getDb().select({ projectId: webhooks.projectId }).from(webhooks).where(eq(webhooks.id, id));
  await requireProjectMember(user, target?.projectId);
  const v = (k: string) => {
    const s = String(formData.get(k) ?? '').trim();
    return s || null;
  };
  await getDb()
    .update(webhooks)
    .set({
      channel,
      label: v('label'),
      url: validHttpUrl(v('url')),
      telegramToken: v('telegramToken'),
      telegramChatId: v('telegramChatId'),
      events: formData.getAll('events').map(String),
      enabled: formData.get('enabled') !== null,
    })
    .where(eq(webhooks.id, id));
  revalidatePath('/settings/integrations');
}

export async function deleteWebhookAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const [target] = await getDb().select({ projectId: webhooks.projectId }).from(webhooks).where(eq(webhooks.id, id));
  await requireProjectMember(user, target?.projectId);
  await getDb().delete(webhooks).where(eq(webhooks.id, id));
  revalidatePath('/settings/integrations');
}

export async function testWebhookAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  const [w] = await getDb().select().from(webhooks).where(eq(webhooks.id, id));
  if (!w) return;
  await requireProjectMember(user, w.projectId);
  await dispatchWebhook({
    url: w.url ?? '',
    channel: w.channel as Channel,
    event: {
      type: 'test',
      title: 'vacti test notification',
      message: 'Webhook configured correctly.',
      severity: 'info',
    },
    telegram:
      w.channel === 'telegram' ? { botToken: w.telegramToken ?? '', chatId: w.telegramChatId ?? '' } : undefined,
  });
  revalidatePath('/settings/integrations');
}
