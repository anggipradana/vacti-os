import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { renderPdf } from './render';
import { renderVaReport } from './va-report';
import { DEFAULT_VA_SETTINGS } from './types';

process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||= 'ubuntu24.04';
let hasBrowser = false;
try {
  hasBrowser = existsSync(chromium.executablePath());
} catch {
  hasBrowser = false;
}

describe.skipIf(!hasBrowser)('renderPdf', () => {
  it('renders a VA report to a valid PDF', async () => {
    const html = renderVaReport({
      lang: 'en',
      type: 'full',
      settings: DEFAULT_VA_SETTINGS,
      signatories: [{ role: 'prepared', name: 'A', position: 'Analyst' }],
      target: { domain: 'example.com' },
      scan: { status: 'completed', startedAt: new Date(), finishedAt: new Date() },
      counts: { subdomains: 1, endpoints: 1, ports: 0 },
      endpoints: [{ url: 'http://example.com', statusCode: 200, title: 'Home' }],
      ports: [],
      subdomains: ['a.example.com'],
      vulns: [{ name: 'Test', severity: 3, status: 'open' }],
    });
    const pdf = await renderPdf(html);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 60000);
});
