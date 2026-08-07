import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runTool } from './runner';
import { httpxArgs, parseHttpxLine, type HttpxResult } from './adapters/httpx';
import { naabuArgs, parseNaabuLine } from './adapters/naabu';

const has = (bin: string): boolean => spawnSync('which', [bin]).status === 0;
const haveTools = has('httpx') && has('naabu');

// Localhost-only - authorized self-scan. Skips automatically when the binaries are absent (e.g. CI).
describe.skipIf(!haveTools)('recon tools against localhost', () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><head><title>vacti test</title></head><body>ok</body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('httpx probes the local server', async () => {
    const r = await runTool({ bin: 'httpx', args: httpxArgs(), input: `127.0.0.1:${port}\n`, timeoutMs: 30000 });
    const results = r.lines.map(parseHttpxLine).filter((x): x is HttpxResult => x !== null);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.statusCode).toBe(200);
    expect(results[0]!.url).toContain(String(port));
  });

  it('naabu finds the open port via connect scan', async () => {
    const r = await runTool({ bin: 'naabu', args: naabuArgs('127.0.0.1', String(port)), timeoutMs: 30000 });
    const ports = r.lines.map(parseNaabuLine).flatMap((p) => (p ? [p.port] : []));
    expect(ports).toContain(port);
  });
});
