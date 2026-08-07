import { eq } from 'drizzle-orm';
import { webhooks, type Database } from '@vacti/db';
import { dispatchWebhook } from './notify';
import type { Channel, NotificationEvent } from './events';

/** Load enabled webhooks for a project and dispatch an event to those subscribed to its type. */
export async function sendProjectNotifications(
  db: Database,
  projectId: string,
  ev: NotificationEvent,
): Promise<number> {
  const rows = await db.select().from(webhooks).where(eq(webhooks.projectId, projectId));
  const targets = rows.filter((w) => w.enabled && (w.events.length === 0 || w.events.includes(ev.type)));
  await Promise.all(
    targets.map((w) =>
      dispatchWebhook({
        url: w.url ?? '',
        channel: w.channel as Channel,
        event: ev,
        telegram:
          w.channel === 'telegram' ? { botToken: w.telegramToken ?? '', chatId: w.telegramChatId ?? '' } : undefined,
      }),
    ),
  );
  return targets.length;
}
