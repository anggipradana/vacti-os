import { describe, it, expect } from 'vitest';
import { renderVaReport } from './va-report';
import { renderTiReport } from './ti-report';
import { DEFAULT_VA_SETTINGS, DEFAULT_TI_SETTINGS } from './types';

describe('VA report html', () => {
  const html = renderVaReport({
    lang: 'en',
    type: 'full',
    settings: DEFAULT_VA_SETTINGS,
    signatories: [{ role: 'prepared', name: 'A', position: 'Analyst' }],
    target: { domain: 'example.com' },
    scan: { status: 'completed', startedAt: new Date(), finishedAt: new Date() },
    counts: { subdomains: 2, endpoints: 5, ports: 3 },
    endpoints: [{ url: 'http://example.com', statusCode: 200, title: 'Home', tech: ['nginx'] }],
    ports: [{ ip: '1.1.1.1', port: 443 }],
    subdomains: ['a.example.com'],
    vulns: [
      {
        name: 'XSS',
        severity: 3,
        status: 'open',
        matchedAt: 'http://example.com/?q=',
        isAiEnriched: true,
        aiRemediation: 'Encode output.',
      },
    ],
  });
  it('contains cover, approval, executive summary, vulnerabilities + AI detail', () => {
    expect(html).toContain('Vulnerability Assessment Report');
    expect(html).toContain('example.com');
    expect(html).toContain('Approval Sheet');
    expect(html).toContain('Table of Contents'); // bilingual TOC
    expect(html).toContain('Executive Summary');
    expect(html).toContain('Vulnerability Summary'); // aggregated summary table
    expect(html).toContain('Affected URLs'); // url chips per finding
    expect(html).toContain('XSS');
    expect(html).toContain('Encode output.'); // AI remediation rendered
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });
  it('honors Indonesian + report type', () => {
    const recon = renderVaReport({
      lang: 'id',
      type: 'recon',
      settings: DEFAULT_VA_SETTINGS,
      signatories: [],
      target: { domain: 'x.id' },
      scan: { status: 'completed' },
      counts: { subdomains: 0, endpoints: 0, ports: 0 },
      endpoints: [],
      ports: [],
      subdomains: [],
      vulns: [],
    });
    expect(recon).toContain('Laporan Vulnerability Assessment');
    expect(recon).toContain('Daftar Isi'); // bilingual TOC present
    expect(recon).toContain('Inventaris Subdomain'); // subdomain inventory section present for recon type
  });
});

describe('TI report html', () => {
  const html = renderTiReport({
    lang: 'en',
    settings: DEFAULT_TI_SETTINGS,
    signatories: [],
    project: { name: 'Acme' },
    risk: { score: 72, color: 'red' },
    totals: { pulses: 3, malware: 1, leaks: 5 },
    otx: [{ indicator: 'acme.com', pulses: 3, malwareCount: 1, reputation: 40 }],
    leaks: [{ identifier: 'a@acme.com', source: 'BreachX', status: 'new' }],
    indicators: [{ type: 'domain', value: 'evil.com' }],
  });
  it('contains risk, IoC, breach sections', () => {
    expect(html).toContain('Cyber Threat Intelligence Report');
    expect(html).toContain('72 / 100');
    expect(html).toContain('Indicators of Compromise');
    expect(html).toContain('a@acme.com');
    expect(html).toContain('CONFIDENTIAL');
  });
});
