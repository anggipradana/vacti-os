'use client';
import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';

export function NewScanDialog({
  targets,
  profiles = [],
}: {
  targets: { id: string; domain: string }[];
  profiles?: { id: string; name: string }[];
}) {
  const disabled = targets.length === 0;
  const [starting, setStarting] = React.useState(false);
  const [err, setErr] = React.useState('');

  // Plain fetch + window.location: the server action's redirect response was dropped on this page
  // in the production build, leaving the button spinning while the scan silently started.
  const start = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    setErr('');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/internal/start-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: String(fd.get('targetId') ?? ''),
          profileId: String(fd.get('profileId') ?? ''),
          mode: String(fd.get('mode') ?? 'active'),
          deepScan: fd.get('deepScan') === '1',
          timeoutMin: String(fd.get('timeoutMin') ?? ''),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; scanId?: string };
      if (data.ok && data.scanId) {
        window.location.assign(`/scans/${data.scanId}`);
        return; // keep the spinner while the browser navigates
      }
      setErr('Could not start the scan, try again.');
      setStarting(false);
    } catch {
      setErr('Request failed, try again.');
      setStarting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled} data-testid="new-scan-trigger">
          <Plus /> New scan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a scan</DialogTitle>
          <DialogDescription>
            Active runs subfinder → httpx → naabu → nuclei. Passive pulls OSINT (VirusTotal + Wayback) for
            URLs/IPs/exposures with no traffic to the target. Full does both.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={start} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="targetId">Target</Label>
            <Select id="targetId" name="targetId" data-testid="scan-target" required>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.domain}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mode">Mode</Label>
            <Select id="mode" name="mode" data-testid="scan-mode" defaultValue="active">
              <option value="active">Active (binary recon pipeline)</option>
              <option value="passive">Passive (OSINT only - no traffic to target)</option>
              <option value="full">Full (passive discovery → active)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeoutMin">Timeout (menit)</Label>
            <Input
              id="timeoutMin"
              name="timeoutMin"
              type="number"
              min={1}
              max={600}
              defaultValue={60}
              data-testid="scan-timeout"
            />
            <p className="text-xs text-fg-subtle">
              Berapa lama tiap tool boleh jalan. Scan besar multi-domain bisa diset sampai 600 menit (10 jam).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="deepScan" value="1" data-testid="scan-deep" />
            Deep-fetch discovered URLs (passive/full) - fetches bodies (SSRF-guarded) to scan for secrets
          </label>
          {profiles.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="profileId">Scan profile</Label>
              <Select id="profileId" name="profileId" defaultValue="">
                <option value="">Default (all stages)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" data-testid="start-scan" className="w-full" loading={starting}>
            {starting ? 'Starting…' : 'Start scan'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
