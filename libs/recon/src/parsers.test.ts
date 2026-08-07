import { describe, it, expect } from 'vitest';
import { parseSubfinderLine } from './adapters/subfinder';
import { parseHttpxLine } from './adapters/httpx';
import { parseNaabuLine } from './adapters/naabu';
import { parseNucleiLine, nucleiArgs } from './adapters/nuclei';
import { isWordPress } from './wordpress';
import { mapNucleiSeverity } from './severity';
import { Severity } from '@vacti/core';

describe('subfinder parser', () => {
  it('extracts host', () => {
    expect(parseSubfinderLine('{"host":"api.example.com","input":"example.com","source":"crtsh"}')).toEqual({
      host: 'api.example.com',
      source: 'crtsh',
    });
    expect(parseSubfinderLine('not json')).toBeNull();
  });
});

describe('httpx parser', () => {
  const line =
    '{"port":"8099","url":"http://127.0.0.1:8099","input":"127.0.0.1:8099","title":"Directory listing for /","scheme":"http","webserver":"SimpleHTTP/0.6 Python/3.14.4","host":"127.0.0.1","a":["127.0.0.1"],"tech":["Python:3.14.4","SimpleHTTP:0.6"],"status_code":200,"content_length":1256}';
  it('maps the rich object', () => {
    const r = parseHttpxLine(line)!;
    expect(r.url).toBe('http://127.0.0.1:8099');
    expect(r.statusCode).toBe(200);
    expect(r.webServer).toContain('Python');
    expect(r.tech).toContain('Python:3.14.4');
    expect(r.ips).toEqual(['127.0.0.1']);
  });
});

describe('naabu parser', () => {
  it('extracts ip/port/protocol', () => {
    expect(parseNaabuLine('{"ip":"127.0.0.1","port":8099,"protocol":"tcp","tls":false}')).toEqual({
      ip: '127.0.0.1',
      port: 8099,
      protocol: 'tcp',
    });
  });
});

describe('nuclei parser', () => {
  const line =
    '{"template-id":"tech-detect","info":{"name":"Wappalyzer Technology Detection","severity":"info","tags":["tech","discovery"]},"type":"http","host":"127.0.0.1","port":"8099","scheme":"http","url":"http://127.0.0.1:8099","matched-at":"http://127.0.0.1:8099"}';
  it('maps id/name/severity/tags', () => {
    const r = parseNucleiLine(line)!;
    expect(r.templateId).toBe('tech-detect');
    expect(r.severity).toBe(Severity.Info);
    expect(r.tags).toContain('tech');
    expect(r.cveIds).toEqual([]);
    expect(r.references).toEqual([]);
  });
  it('extracts cvss, cve, references and template prose', () => {
    const enriched =
      '{"template-id":"CVE-2021-1234","info":{"name":"Some RCE","severity":"critical","description":"A bug.","remediation":"Patch it.","reference":["https://a.test","https://b.test"],"classification":{"cvss-score":9.8,"cve-id":"CVE-2021-1234","cwe-id":["CWE-79"]}},"type":"http","url":"http://x"}';
    const r = parseNucleiLine(enriched)!;
    expect(r.cvss).toBe(9.8);
    expect(r.cveIds).toEqual(['CVE-2021-1234']); // string normalised to array
    expect(r.references).toEqual(['https://a.test', 'https://b.test']);
    expect(r.description).toBe('A bug.');
    expect(r.remediation).toBe('Patch it.');
  });
});

describe('nuclei profile options + allow-list', () => {
  it('emits UA, rate, concurrency, retries, exclude-tags', () => {
    const args = nucleiArgs({
      severities: ['high'],
      userAgent: 'vacti/1.0',
      rateLimit: 100,
      concurrency: 25,
      retries: 2,
      excludeTags: ['dos', 'intrusive'],
    }).join(' ');
    expect(args).toContain('-H User-Agent: vacti/1.0');
    expect(args).toContain('-rate-limit 100');
    expect(args).toContain('-c 25');
    expect(args).toContain('-retries 2');
    expect(args).toContain('-exclude-tags dos,intrusive');
  });
  it('drops non-allow-listed extra args (no flag injection)', () => {
    const args = nucleiArgs({ extraArgs: ['-follow-redirects', '-evil', '/etc/passwd', '-timeout', '10'] });
    expect(args).toContain('-follow-redirects');
    expect(args).toContain('-timeout');
    expect(args).toContain('10');
    expect(args).not.toContain('-evil');
    expect(args).not.toContain('/etc/passwd');
  });
});

describe('severity mapping', () => {
  it('maps strings to the scale', () => {
    expect(mapNucleiSeverity('critical')).toBe(Severity.Critical);
    expect(mapNucleiSeverity('weird')).toBe(Severity.Unknown);
  });
});

describe('wordpress detection', () => {
  it('detects via tech, url, or manual flag', () => {
    expect(isWordPress({ tech: ['WordPress:6.4'], url: 'http://x' })).toBe(true);
    expect(isWordPress({ tech: [], url: 'http://x/wp-login.php' })).toBe(true);
    expect(isWordPress({ tech: [], url: 'http://x/wp-content/themes/a.css' })).toBe(true);
    expect(isWordPress({ tech: [], url: 'http://x/wp-json/wp/v2' })).toBe(true);
    expect(isWordPress({ tech: [], url: 'http://x' }, { manual: true })).toBe(true);
    expect(isWordPress({ tech: ['nginx'], url: 'http://x' })).toBe(false);
  });
  it('does not false-flag unrelated path words containing wp-*', () => {
    expect(isWordPress({ tech: [], url: 'http://x/help/wp-json-guide' })).toBe(false);
    expect(isWordPress({ tech: [], url: 'http://x/my-wp-content-tips' })).toBe(false);
    expect(isWordPress({ tech: [], url: 'http://x/swp-content' })).toBe(false);
  });
});
