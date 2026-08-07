import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createQueue } from './queue';

const url = process.env.DATABASE_URL;

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe.skipIf(!url)('@vacti/queue integration', () => {
  it('round-trips a typed job through pg-boss', async () => {
    const q = createQueue(url!);
    const schema = z.object({ msg: z.string() });
    const received: string[] = [];
    await q.start();
    try {
      await q.work('echo-test', schema, async (p) => {
        received.push(p.msg);
      });
      await q.enqueue('echo-test', schema, { msg: 'hello' });
      await waitFor(() => received.length > 0, 15000);
      expect(received).toContain('hello');
    } finally {
      await q.stop();
    }
  }, 30000);
});
