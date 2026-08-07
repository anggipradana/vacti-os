import { isUrlSafeForServerFetch, assertHostResolvesPublic } from '@vacti/recon';
import { formatPayload } from './format';
import type { Channel, NotificationEvent } from './events';

export type FetchLike = typeof fetch;

export interface DispatchOptions {
  url: string;
  channel: Channel;
  event: NotificationEvent;
  telegram?: { botToken: string; chatId: string };
  retries?: number;
  fetchImpl?: FetchLike;
  /** DNS-resolution guard (throws to block); injectable for tests. Defaults to the SSRF check. */
  dnsGuard?: (host: string) => Promise<void>;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  attempts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST a notification to a webhook with simple backoff retry. Never throws. */
export async function dispatchWebhook(opts: DispatchOptions): Promise<DispatchResult> {
  const { channel, event, telegram, retries = 2, fetchImpl = fetch, dnsGuard = assertHostResolvesPublic } = opts;
  const { body, overrideUrl } = formatPayload(channel, event, telegram);
  const target = overrideUrl ?? opts.url;
  // SSRF guard on user-configured destinations (overrideUrl is the fixed Telegram API host):
  // a webhook must never reach localhost/cloud-metadata/private ranges, by literal or by DNS.
  if (!overrideUrl) {
    if (!isUrlSafeForServerFetch(target)) return { ok: false, status: 0, attempts: 0 };
    try {
      await dnsGuard(new URL(target).hostname);
    } catch {
      return { ok: false, status: 0, attempts: 0 };
    }
  }
  let attempts = 0;
  let status = 0;
  for (let i = 0; i <= retries; i++) {
    attempts++;
    try {
      const res = await fetchImpl(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      status = res.status;
      if (res.ok) return { ok: true, status, attempts };
      if (res.status === 429 || res.status >= 500) {
        await sleep(200 * (i + 1));
        continue;
      }
      return { ok: false, status, attempts };
    } catch {
      await sleep(200 * (i + 1));
    }
  }
  return { ok: false, status, attempts };
}
