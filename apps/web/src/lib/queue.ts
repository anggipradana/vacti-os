import 'server-only';
import { createQueue, type Queue } from '@vacti/queue';
import { env } from './db';

let queue: Queue | undefined;
let started = false;

/** Lazy, process-wide pg-boss client used by the API to enqueue scans. */
export async function getQueue(): Promise<Queue> {
  if (!queue) queue = createQueue(env().DATABASE_URL);
  if (!started) {
    await queue.start();
    started = true;
  }
  return queue;
}
