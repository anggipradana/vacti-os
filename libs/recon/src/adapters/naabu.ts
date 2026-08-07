export interface PortResult {
  ip: string;
  port: number;
  protocol: string;
}

export interface NaabuOptions {
  /** 'c' = connect (no root/libpcap), 's' = SYN (needs privileges). Default connect. */
  scanType?: 'c' | 's';
  /** Skip hosts behind a CDN. Needs network to fetch CDN ranges, so off by default. */
  excludeCdn?: boolean;
}

/** `ports` e.g. "80,443,8080" or "top-1000" or "-" for all. */
export function naabuArgs(host: string, ports: string, opts: NaabuOptions = {}): string[] {
  const args = ['-host', host, '-p', ports, '-json', '-silent', '-scan-type', opts.scanType ?? 'c'];
  if (opts.excludeCdn) args.push('-exclude-cdn');
  return args;
}

export function parseNaabuLine(line: string): PortResult | null {
  try {
    const j = JSON.parse(line) as { ip?: string; port?: number; protocol?: string };
    return j.ip && typeof j.port === 'number' ? { ip: j.ip, port: j.port, protocol: j.protocol ?? 'tcp' } : null;
  } catch {
    return null;
  }
}
