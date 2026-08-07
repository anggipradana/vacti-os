import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ArrowLeft, Download, RefreshCw, KeyRound, ShieldAlert } from 'lucide-react';
import { Permission, roleFromUser } from '@vacti/core';
import { leakSearches, leakSearchResults, projects } from '@vacti/db';
import { PageHeader } from '../../../../components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge, type BadgeProps } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Select } from '../../../../components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { AutoSubmitSelect } from '../../../../components/ui/auto-submit-select';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { getDb } from '../../../../lib/db';
import { requirePermission } from '../../../../lib/authz';
import { tenantScope, scopeWhere } from '../../../../lib/tenancy';
import { fmtDateTime, humanize } from '../../../../lib/format';
import {
  updateCaseAction,
  rerunCaseAction,
  deleteCaseAction,
  setLeakResultStatusAction,
} from '../../../../lib/leaks-actions';
import { RevealPasswordCell, RevealAllProvider, RevealAllButton } from './reveal-password-cell';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'reviewed', 'confirmed', 'false_positive'] as const;
const STATUS_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  new: 'neutral',
  reviewed: 'accent',
  confirmed: 'danger',
  false_positive: 'outline',
};

export default async function LeakCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // RBAC: Leaks is an operator tool (Penetration Tester/SysAdmin); Auditor is excluded by InitiateScans.
  const user = await requirePermission(Permission.InitiateScans);
  const { id } = await params;
  const db = getDb();

  const [c] = await db.select().from(leakSearches).where(eq(leakSearches.id, id));
  // Owner guard: the case must be owned by the caller, or the caller is a SysAdmin. Else 404 (do not
  // leak existence). Do this BEFORE any further reads.
  if (!c || (c.userId !== user.id && roleFromUser(user) !== 'SysAdmin')) notFound();

  // `provider` is INTERNAL - never selected into the page payload nor rendered. `passwordCiphertext` is
  // reduced to a boolean so the ciphertext never reaches the client; the plaintext is revealed only via
  // the audited revealCasePasswordAction on click.
  const resultRows = await db
    .select({
      id: leakSearchResults.id,
      source: leakSearchResults.source,
      identifier: leakSearchResults.identifier,
      passwordCiphertext: leakSearchResults.passwordCiphertext,
      origin: leakSearchResults.origin,
      extra: leakSearchResults.extra,
      status: leakSearchResults.status,
    })
    .from(leakSearchResults)
    .where(eq(leakSearchResults.searchId, id))
    .orderBy(leakSearchResults.createdAt);

  // Projects the caller may attach the case to (tenancy-scoped; SysAdmin sees all).
  const t = await tenantScope(user);
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));

  // Thin inline server-action wrappers: the shared actions return a status object, but a <form action>
  // must resolve to void - so wrap-and-discard. deleteAndRedirect additionally sends the user back to the
  // Cases list once the row (and its cascaded results) are gone.
  async function deleteAndRedirect(formData: FormData) {
    'use server';
    await deleteCaseAction(formData);
    redirect('/leaks');
  }
  async function rerunCase(formData: FormData) {
    'use server';
    await rerunCaseAction(formData);
  }
  async function updateCase(formData: FormData) {
    'use server';
    await updateCaseAction(formData);
  }
  async function triageResult(formData: FormData) {
    'use server';
    await setLeakResultStatusAction(formData);
  }

  // Group the saved rows by `source` (one section per database), and for each group compute the COLUMN
  // union = every key seen across that group's `extra` maps (the full non-password column set), plus a
  // synthetic Password column when any row in the group carries a ciphertext. Groups sort by descending row
  // count. `provider` is never part of `extra` nor rendered.
  const groupMap = new Map<string, typeof resultRows>();
  for (const r of resultRows) {
    const src = r.source || 'unknown';
    const bucket = groupMap.get(src);
    if (bucket) bucket.push(r);
    else groupMap.set(src, [r]);
  }
  const groups = [...groupMap.entries()]
    .map(([source, rows]) => {
      const columns = new Set<string>();
      let anyPassword = false;
      for (const row of rows) {
        if (row.extra && typeof row.extra === 'object') {
          for (const k of Object.keys(row.extra as object)) columns.add(k);
        }
        if (row.passwordCiphertext) anyPassword = true;
      }
      return { source, rows, columns: [...columns], anyPassword };
    })
    .sort((a, b) => b.rows.length - a.rows.length);
  const caseHasPassword = groups.some((g) => g.anyPassword);

  return (
    <>
      <PageHeader
        title={c.name}
        description={`Saved leak case - ${c.resultCount} result(s) across ${c.sourceCount} source(s)`}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/leaks">
                <ArrowLeft className="size-4" /> Back
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/leaks/${c.id}/export`} download>
                <Download className="size-4" /> Export CSV
              </a>
            </Button>
            <form action={rerunCase}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton
                variant="outline"
                pendingText="Re-running..."
                title="Re-run the query and overwrite the saved snapshot (consumes one search quota unit)"
              >
                <RefreshCw className="size-4" /> Re-run
              </SubmitButton>
            </form>
            <form action={deleteAndRedirect}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton
                variant="ghost"
                className="text-danger hover:text-danger"
                confirm="Delete this case and its saved results? This cannot be undone."
              >
                Delete
              </ConfirmButton>
            </form>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
        <span className="inline-flex items-center gap-1 font-mono text-fg">
          <KeyRound className="size-3.5 text-accent" /> {c.query}
        </span>
        {c.searchType ? <Badge variant="outline">{c.searchType}</Badge> : null}
        <span>created {fmtDateTime(c.createdAt)}</span>
        <span>updated {fmtDateTime(c.updatedAt)}</span>
      </div>

      {/* Case metadata: rename, note, tags, attach-to-project. One form -> updateCaseAction (which reads
          name/note/tags/projectId together). */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Case details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateCase} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <label className="text-xs font-medium text-fg-muted">
              Name
              <Input name="name" defaultValue={c.name} maxLength={300} className="mt-1" aria-label="case name" />
            </label>
            <label className="text-xs font-medium text-fg-muted">
              Attach to project
              <Select name="projectId" defaultValue={c.projectId ?? ''} className="mt-1" aria-label="attach to project">
                <option value="">Not attached</option>
                {projectRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium text-fg-muted">
              Tags (comma separated)
              <Input
                name="tags"
                defaultValue={(c.tags ?? []).join(', ')}
                className="mt-1"
                aria-label="tags"
                placeholder="e.g. corp, high-priority"
              />
            </label>
            <label className="text-xs font-medium text-fg-muted sm:col-span-2">
              Note
              <Textarea
                name="note"
                defaultValue={c.note ?? ''}
                rows={3}
                className="mt-1"
                aria-label="case note"
                placeholder="Analyst notes for this case..."
              />
            </label>
            <div className="sm:col-span-2">
              <SubmitButton size="sm" pendingText="Saving...">
                Save details
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-accent" /> Results
          </CardTitle>
          {resultRows.length > 0 ? <RevealAllButton hasAnyPassword={caseHasPassword} /> : null}
        </CardHeader>
        <CardContent>
          {resultRows.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="size-6" />}
              title="No results saved"
              description="This case has no stored rows. Re-run the query to refresh the snapshot."
            />
          ) : (
            <RevealAllProvider searchId={c.id}>
              <div className="space-y-8">
                {groups.map((g) => (
                  <section key={g.source}>
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-fg">{g.source}</h3>
                      <Badge variant="neutral">{g.rows.length}</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <TR>
                            {g.columns.map((col) => (
                              <TH key={col}>{humanize(col)}</TH>
                            ))}
                            {g.anyPassword ? <TH>Password</TH> : null}
                            <TH className="w-40">Status</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {g.rows.map((r) => {
                            const extra =
                              r.extra && typeof r.extra === 'object'
                                ? (r.extra as Record<string, unknown>)
                                : ({} as Record<string, unknown>);
                            return (
                              <TR key={r.id}>
                                {g.columns.map((col) => {
                                  const v = extra[col];
                                  return (
                                    <TD key={col} className="whitespace-normal break-all align-top font-mono text-xs">
                                      {v == null || v === '' ? (
                                        <span className="text-fg-subtle">-</span>
                                      ) : (
                                        <span>{String(v)}</span>
                                      )}
                                    </TD>
                                  );
                                })}
                                {g.anyPassword ? (
                                  <TD className="align-top">
                                    <RevealPasswordCell resultId={r.id} hasPassword={Boolean(r.passwordCiphertext)} />
                                  </TD>
                                ) : null}
                                <TD className="align-top">
                                  <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{humanize(r.status)}</Badge>
                                  <form action={triageResult} className="mt-1.5">
                                    <input type="hidden" name="resultId" value={r.id} />
                                    <AutoSubmitSelect name="status" defaultValue={r.status} className="h-7 text-xs">
                                      {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {humanize(s)}
                                        </option>
                                      ))}
                                    </AutoSubmitSelect>
                                  </form>
                                </TD>
                              </TR>
                            );
                          })}
                        </TBody>
                      </Table>
                    </div>
                  </section>
                ))}
              </div>
            </RevealAllProvider>
          )}
        </CardContent>
      </Card>
    </>
  );
}
