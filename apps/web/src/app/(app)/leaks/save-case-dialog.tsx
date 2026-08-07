'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Check } from 'lucide-react';
import type { PublicLeakRecord } from '../../../lib/leak-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { saveCaseAction } from '../../../lib/leaks-actions';

/**
 * Opt-in "Save as Case": names the current ephemeral result set and persists it via saveCaseAction (the
 * server encrypts passwords at rest). The current records array is passed straight to the action. On
 * success we refresh so the Cases tab picks up the new row.
 */
export function SaveCaseDialog({ records, query }: { records: PublicLeakRecord[]; query: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(query);
      setError(null);
    }
  }, [open, query]);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await saveCaseAction({ name: name.trim() || query, query, records });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? 'Could not save the case.');
      }
    } catch {
      setError('Could not save the case.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Save className="size-4" /> Save as Case
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Case</DialogTitle>
            <DialogDescription>
              Persist these {records.length} result{records.length === 1 ? '' : 's'} as a named Case for later triage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="case-name">Case name</Label>
            <Input
              id="case-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={query || 'Untitled case'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
              autoFocus
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={pending} onClick={() => void save()}>
              <Check className="size-4" /> Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
