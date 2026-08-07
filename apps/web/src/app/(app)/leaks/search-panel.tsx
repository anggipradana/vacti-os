'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, ShieldAlert, Ban, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { SubmitButton } from '../../../components/ui/submit-button';
import { EmptyState } from '../../../components/ui/empty-state';
import { runLeakSearchAction, type LeakSearchState } from '../../../lib/leaks-actions';
import type { QuotaState } from '../../../lib/leaks-service';
import { ResultsTable } from './results-table';

const TYPES = ['auto', 'email', 'domain', 'username', 'phone', 'hash', 'keyword'] as const;
const LIMITS = ['100', '300', '500', '1000'] as const;

const INITIAL: LeakSearchState = { ok: false };

/**
 * Search tab: one freeform query + an Advanced toggle (type / limit). Uses useActionState so the whole
 * search runs server-side (quota-consumed, provider fan-out) while the button shows a pending state. The
 * returned records are ephemeral and live only in this client island. Passwords are masked in the table.
 */
export function SearchPanel({ onQuota }: { onQuota: (q: QuotaState) => void }) {
  const [state, formAction] = React.useActionState(runLeakSearchAction, INITIAL);
  const [advanced, setAdvanced] = React.useState(false);

  // Push the server-returned quota up to the header chip after each search.
  React.useEffect(() => {
    if (state.quota) onQuota(state.quota);
  }, [state.quota, onQuota]);

  const blocked = !!state.error && /limit reached/i.test(state.error);
  const records = state.records ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <form action={formAction} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-1.5">
                <Label htmlFor="query">Query</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                  <Input
                    id="query"
                    name="query"
                    placeholder="email, domain, username, phone or name"
                    className="pl-8"
                    defaultValue={state.query ?? ''}
                    autoFocus
                  />
                </div>
              </div>
              <SubmitButton pendingText="Searching...">
                <Search className="size-4" /> Search
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
                <SlidersHorizontal className="size-4" /> Advanced
              </Button>
            </div>

            {advanced ? (
              <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <Select id="type" name="type" defaultValue="auto" className="w-44">
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="limit">Max results</Label>
                  <Select id="limit" name="limit" defaultValue="100" className="w-32">
                    {LIMITS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {blocked ? (
        <EmptyState icon={<Ban />} title="Search limit reached" description={state.error} />
      ) : state.error ? (
        <EmptyState icon={<TriangleAlert />} title="Search failed" description={state.error} />
      ) : state.ok && records.length > 0 ? (
        <ResultsTable records={records} query={state.query ?? ''} sources={state.sources ?? 0} />
      ) : state.ok ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="No leaks found"
          description={`Nothing matched "${state.query ?? ''}".`}
        />
      ) : (
        <EmptyState
          icon={<Search />}
          title="Search for leaked credentials"
          description="Search for leaked credentials by email, domain, username, phone or name."
        />
      )}
    </div>
  );
}
