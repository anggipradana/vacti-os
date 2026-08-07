import { describe, it, expect, vi } from 'vitest';
import { validateProviderKey } from './key-check';

const ok = (status = 200) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe('validateProviderKey', () => {
  it('reports valid on a 2xx response and sends the key in the right place', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(200));
    const res = await validateProviderKey('openai', 'sk-test', { fetchImpl });
    expect(res.status).toBe('valid');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('puts the VirusTotal key in the query string (v2 API), not a header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(200));
    await validateProviderKey('virustotal', 'vt-key', { fetchImpl });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('apikey=vt-key');
  });

  it('treats VirusTotal 204 (rate-limited) as a valid key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(204));
    expect((await validateProviderKey('virustotal', 'k', { fetchImpl })).status).toBe('valid');
  });

  it('reports invalid on 401/403', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(401));
    expect((await validateProviderKey('otx', 'bad', { fetchImpl })).status).toBe('invalid');
  });

  it('treats 429 as valid (rate-limited but accepted)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(429));
    expect((await validateProviderKey('urlscan', 'k', { fetchImpl })).status).toBe('valid');
  });

  it('reports error on a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await validateProviderKey('openai', 'k', { fetchImpl })).status).toBe('error');
  });

  it('supports openai with a Bearer key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(200));
    const res = await validateProviderKey('openai', 'sk-x', { fetchImpl });
    expect(res.status).toBe('valid');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x');
  });

  it('reports error for an unknown provider and invalid for an empty key', async () => {
    expect((await validateProviderKey('nope', 'k')).status).toBe('error');
    expect((await validateProviderKey('openai', '  ')).status).toBe('invalid');
  });
});
