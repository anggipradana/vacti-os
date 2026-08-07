import { spawn } from 'node:child_process';

export interface RunToolOptions {
  bin: string;
  args: string[];
  /** Optional stdin payload (e.g. host list piped to httpx). */
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called for each non-empty stdout line as it streams. */
  onLine?: (line: string) => void;
}

export interface RunResult {
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
  lines: string[];
  stderr: string;
}

/**
 * Run an external tool, streaming stdout line-by-line. The child is its own process group so a
 * timeout or AbortSignal kills the whole tree (tools that spawn helpers). Pure I/O - no parsing.
 */
export function runTool(opts: RunToolOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(opts.bin, opts.args, { detached: true });
    const lines: string[] = [];
    let stdoutBuf = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;

    const killGroup = (sig: NodeJS.Signals): void => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        // already dead
      }
    };

    const timer = opts.timeoutMs
      ? setTimeout(() => ((timedOut = true), killGroup('SIGKILL')), opts.timeoutMs)
      : undefined;
    const onAbort = (): void => ((aborted = true), killGroup('SIGKILL'));
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (line) {
          lines.push(line);
          opts.onLine?.(line);
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      const tail = stdoutBuf.trim();
      if (tail) lines.push(tail);
      resolve({ code, timedOut, aborted, durationMs: Date.now() - start, lines, stderr });
    });

    // Always close stdin: tools like naabu block waiting on an open stdin pipe otherwise.
    // The 'error' handler is mandatory: if the child dies before draining stdin (bad args, fast
    // crash, timeout SIGKILL) the async write fails with EPIPE, which without a listener becomes
    // an uncaughtException that takes down the whole worker.
    if (child.stdin) {
      child.stdin.on('error', () => {});
      try {
        if (opts.input !== undefined) child.stdin.write(opts.input);
        child.stdin.end();
      } catch {
        // child already gone; 'close' will still fire and resolve
      }
    }
  });
}
