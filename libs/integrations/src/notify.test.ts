import { describe, it, expect, vi } from 'vitest';
import { formatPayload } from './format';
import { dispatchWebhook } from './notify';

const ev = {
  type: 'scan.completed' as const,
  title: 'Scan done',
  message: 'example.com',
  severity: 'success' as const,
  fields: { Status: 'completed' },
};

describe('formatPayload', () => {
  it('builds a Discord embed', () => {
    const p = formatPayload('discord', ev);
    expect(p.body).toHaveProperty('embeds');
    expect((p.body as { embeds: { title: string }[] }).embeds[0]!.title).toBe('Scan done');
  });
  it('builds Slack text', () => {
    expect((formatPayload('slack', ev).body as { text: string }).text).toContain('Scan done');
  });
  it('builds a Google Chat cardsV2 (header + fields) with text fallback', () => {
    const body = formatPayload('google_chat', ev).body as {
      text: string;
      cardsV2: { card: { header: { title: string }; sections: { widgets: unknown[] }[] } }[];
    };
    expect(body.text).toContain('example.com'); // fallback text
    const card = body.cardsV2[0]!.card;
    expect(card.header.title).toContain('Scan done');
    expect(card.sections[0]!.widgets.length).toBeGreaterThan(0);
  });
  it('routes Telegram to the bot API with chat_id, plain text (no parse_mode)', () => {
    const p = formatPayload('telegram', ev, { botToken: 'T', chatId: 'C' });
    expect(p.overrideUrl).toContain('/botT/sendMessage');
    const body = p.body as { chat_id: string; text: string; parse_mode?: string };
    expect(body.chat_id).toBe('C');
    // No parse_mode: unescaped Markdown in notification content would otherwise 400 the message.
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).not.toContain('*');
  });
});

describe('dispatchWebhook', () => {
  it('posts and returns ok on 200', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    const r = await dispatchWebhook({
      url: 'http://hook',
      channel: 'slack',
      event: ev,
      fetchImpl: f as unknown as typeof fetch,
      dnsGuard: async () => {},
    });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledOnce();
  });
  it('retries on 500 then gives up', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    const r = await dispatchWebhook({
      url: 'http://hook',
      channel: 'slack',
      event: ev,
      retries: 1,
      fetchImpl: f as unknown as typeof fetch,
      dnsGuard: async () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
  });
  it('does not retry on 400', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 400 }) as Response);
    const r = await dispatchWebhook({
      url: 'http://hook',
      channel: 'discord',
      event: ev,
      retries: 3,
      fetchImpl: f as unknown as typeof fetch,
      dnsGuard: async () => {},
    });
    expect(r.attempts).toBe(1);
  });
  it('blocks private/internal destinations without sending (SSRF guard)', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    const literal = await dispatchWebhook({
      url: 'http://169.254.169.254/hook',
      channel: 'generic',
      event: ev,
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(literal).toEqual({ ok: false, status: 0, attempts: 0 });
    const viaDns = await dispatchWebhook({
      url: 'http://internal-host.example.com/hook',
      channel: 'generic',
      event: ev,
      fetchImpl: f as unknown as typeof fetch,
      dnsGuard: async () => {
        throw new Error('resolves private');
      },
    });
    expect(viaDns).toEqual({ ok: false, status: 0, attempts: 0 });
    expect(f).not.toHaveBeenCalled();
  });
});

import { parseEnrichment, enrichVulnerability, buildVulnPrompt, enrichmentHash, generateBrandSentiment } from './ai';

describe('AI enrichment', () => {
  it('parses three sections', () => {
    const out = parseEnrichment('Description:\nXSS in q param.\nImpact:\nSession theft.\nRemediation:\nEncode output.');
    expect(out.description).toContain('XSS');
    expect(out.impact).toContain('Session');
    expect(out.remediation).toContain('Encode');
  });
  it('enriches via a stub provider', async () => {
    const provider = { generate: async () => 'Description:\nD\nImpact:\nI\nRemediation:\nR' };
    const e = await enrichVulnerability({ name: 'XSS', type: 'xss' }, provider);
    expect(e).toEqual({ description: 'D', impact: 'I', remediation: 'R' });
  });
  it('builds a prompt and a stable hash', () => {
    expect(buildVulnPrompt({ name: 'XSS', type: 'xss', severity: 3 })).toContain('Finding: XSS');
    expect(enrichmentHash({ name: 'XSS', type: 'xss' })).toBe(enrichmentHash({ name: 'XSS', type: 'xss' }));
  });
});

describe('generateBrandSentiment', () => {
  const provider = (reply: string) => ({ generate: async () => reply });
  it('parses "SENTIMENT | RELEVANCE | reason" replies', async () => {
    const neg = await generateBrandSentiment(
      { brand: 'Acme', title: 'Acme hit by data breach' },
      provider('negative | relevant | customer data leaked'),
    );
    expect(neg).toEqual({ sentiment: 'negative', relevance: 'relevant', reason: 'customer data leaked' });
    const irr = await generateBrandSentiment(
      { brand: 'Acme', title: 'Acme is a Looney Tunes brand' },
      provider('neutral | irrelevant | cartoon, not the company'),
    );
    expect(irr.relevance).toBe('irrelevant');
  });
  it('falls back to neutral/relevant on an unparseable reply', async () => {
    const r = await generateBrandSentiment({ brand: 'Acme', title: 'x' }, provider('I am not sure about this one'));
    expect(r.sentiment).toBe('neutral');
    expect(r.relevance).toBe('relevant');
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
