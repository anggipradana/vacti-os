import { describe, it, expect } from 'vitest';
import { runTool } from './runner';

describe('runTool', () => {
  it('streams stdout lines and captures exit code', async () => {
    const seen: string[] = [];
    const r = await runTool({ bin: 'sh', args: ['-c', 'printf "alpha\\nbeta\\n"'], onLine: (l) => seen.push(l) });
    expect(r.code).toBe(0);
    expect(r.lines).toEqual(['alpha', 'beta']);
    expect(seen).toEqual(['alpha', 'beta']);
  });

  it('kills the process group on timeout', async () => {
    const r = await runTool({ bin: 'sh', args: ['-c', 'sleep 5'], timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.code).not.toBe(0);
  });

  it('aborts via AbortSignal', async () => {
    const ac = new AbortController();
    const p = runTool({ bin: 'sh', args: ['-c', 'sleep 5'], signal: ac.signal });
    setTimeout(() => ac.abort(), 200);
    const r = await p;
    expect(r.aborted).toBe(true);
  });
});
