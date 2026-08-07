import Link from 'next/link';
import { count, desc, eq } from 'drizzle-orm';
import { Crosshair } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { SubmitButton } from './ui/submit-button';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { ConfirmButton } from './ui/confirm-button';
import { EmptyState } from './ui/empty-state';
import { Pagination } from './ui/pagination';
import { FormBanner } from './ui/form-banner';
import { userCan, Permission } from '@vacti/core';
import { projects, targets, users } from '@vacti/db';
import { getDb } from '../lib/db';
import { createTargetAction, editTargetAction, deleteTargetAction } from '../lib/recon-actions';
import { tx, type Locale } from '../lib/i18n';

const PAGE = 20;

type ProjectRow = typeof projects.$inferSelect;
type UserRow = typeof users.$inferSelect;

/**
 * Shared target CRUD surface (add domain + predefined subdomains + custom headers, edit, delete,
 * plus a link into per-target recon notes). Rendered inside both Vulnerability Assessment (/scans)
 * and Cyber Threat Intel (/threat) so target management is no longer a standalone page. Scoped to
 * the active project. `basePath` keeps pagination on the host page; `tpage`/`ok`/`error` come from
 * the host page's search params.
 */
export async function TargetsManager({
  user,
  locale,
  projectId,
  projectRows,
  basePath,
  page = 1,
  ok,
  error,
}: {
  user: UserRow;
  locale: Locale;
  projectId: string | undefined;
  projectRows: ProjectRow[];
  basePath: string;
  page?: number;
  ok?: string;
  error?: string;
}) {
  const db = getDb();
  const safePage = Math.max(1, page || 1);
  const [targetRows, countRows] = projectId
    ? await Promise.all([
        db
          .select()
          .from(targets)
          .where(eq(targets.projectId, projectId))
          .orderBy(desc(targets.createdAt))
          .limit(PAGE)
          .offset((safePage - 1) * PAGE),
        db.select({ n: count() }).from(targets).where(eq(targets.projectId, projectId)),
      ])
    : [[], [{ n: 0 }]];
  const total = Number(countRows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const canModify = userCan(user, Permission.ModifyTargets);

  return (
    <div className="space-y-4">
      <FormBanner
        ok={ok}
        error={error}
        messages={{
          invalid: tx(
            locale,
            'Enter a valid domain (and select a project) before adding a target.',
            'Masukkan domain yang valid (dan pilih proyek) sebelum menambahkan target.',
          ),
        }}
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {canModify ? (
          <Card>
            <CardContent className="pt-5">
              <form action={createTargetAction} className="space-y-4">
                <input type="hidden" name="returnTo" value={basePath} />
                <div className="space-y-1.5">
                  <Label htmlFor="tm-projectId">{tx(locale, 'Project', 'Proyek')}</Label>
                  <Select
                    id="tm-projectId"
                    name="projectId"
                    data-testid="target-project"
                    defaultValue={projectId}
                    required
                  >
                    {projectRows.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-domain">{tx(locale, 'Domain', 'Domain')}</Label>
                  <Input id="tm-domain" name="domain" data-testid="target-domain" placeholder="example.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-subs">{tx(locale, 'Predefined subdomains', 'Subdomain yang ditentukan')}</Label>
                  <Input
                    id="tm-subs"
                    name="predefinedSubdomains"
                    data-testid="target-subs"
                    placeholder="a.example.com b.example.com"
                  />
                  <p className="text-xs text-fg-subtle">
                    {tx(
                      locale,
                      'Space or comma separated. Skips subfinder when set.',
                      'Dipisahkan spasi atau koma. Melewati subfinder jika diisi.',
                    )}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-headers">{tx(locale, 'Custom request headers', 'Header request kustom')}</Label>
                  <Textarea
                    id="tm-headers"
                    name="customHeaders"
                    rows={3}
                    placeholder={'Authorization: Bearer …\nX-Api-Key: …'}
                  />
                  <p className="text-xs text-fg-subtle">
                    {tx(
                      locale,
                      'One per line as "Key: value". Sent by httpx & nuclei.',
                      'Satu per baris sebagai "Key: value". Dikirim oleh httpx & nuclei.',
                    )}
                  </p>
                </div>
                <SubmitButton
                  data-testid="create-target"
                  className="w-full"
                  pendingText={tx(locale, 'Adding…', 'Menambahkan…')}
                >
                  {tx(locale, 'Add target', 'Tambah target')}
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <div data-testid="target-list" className={`space-y-2 ${canModify ? '' : 'lg:col-span-2'}`}>
          {targetRows.length === 0 ? (
            <EmptyState
              icon={<Crosshair />}
              title={tx(locale, 'No targets yet', 'Belum ada target')}
              description={tx(locale, 'Add a domain to scan.', 'Tambahkan domain untuk discan.')}
            />
          ) : (
            targetRows.map((t) => (
              <Card key={t.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/targets/${t.id}`} className="font-mono text-sm text-accent hover:underline">
                      {t.domain}
                    </Link>
                    <div className="flex items-center gap-2">
                      {t.customHeaders ? (
                        <Badge variant="neutral">{tx(locale, 'custom headers', 'header kustom')}</Badge>
                      ) : null}
                      <Badge variant={t.predefinedSubdomains.length ? 'accent' : 'neutral'}>
                        {t.predefinedSubdomains.length
                          ? `${t.predefinedSubdomains.length} ${tx(locale, 'predefined subs', 'subdomain ditentukan')}`
                          : tx(locale, 'discovery on', 'discovery aktif')}
                      </Badge>
                      <Link href={`/targets/${t.id}`} className="text-xs text-fg-muted hover:text-fg">
                        {tx(locale, 'Notes', 'Catatan')}
                      </Link>
                      {canModify ? (
                        <form action={deleteTargetAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="returnTo" value={basePath} />
                          <ConfirmButton
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger/10"
                            confirm={tx(
                              locale,
                              `Delete target ${t.domain} and all its scans/results? This cannot be undone.`,
                              `Hapus target ${t.domain} dan semua scan/hasilnya? Ini tidak bisa dibatalkan.`,
                            )}
                          >
                            {tx(locale, 'Delete', 'Hapus')}
                          </ConfirmButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  {canModify ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
                        {tx(locale, 'Edit', 'Ubah')}
                      </summary>
                      <form action={editTargetAction} className="mt-3 space-y-3">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="returnTo" value={basePath} />
                        <div className="space-y-1.5">
                          <Label htmlFor={`tm-domain-${t.id}`}>{tx(locale, 'Domain', 'Domain')}</Label>
                          <Input id={`tm-domain-${t.id}`} name="domain" defaultValue={t.domain} required />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`tm-subs-${t.id}`}>
                            {tx(locale, 'Predefined subdomains', 'Subdomain yang ditentukan')}
                          </Label>
                          <Input
                            id={`tm-subs-${t.id}`}
                            name="predefinedSubdomains"
                            defaultValue={t.predefinedSubdomains.join(' ')}
                            placeholder="a.example.com b.example.com"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`tm-headers-${t.id}`}>
                            {tx(locale, 'Custom request headers', 'Header request kustom')}
                          </Label>
                          <Textarea
                            id={`tm-headers-${t.id}`}
                            name="customHeaders"
                            rows={3}
                            defaultValue={Object.entries((t.customHeaders ?? {}) as Record<string, string>)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join('\n')}
                            placeholder={'Authorization: Bearer …\nX-Api-Key: …'}
                          />
                        </div>
                        <SubmitButton size="sm" pendingText={tx(locale, 'Saving…', 'Menyimpan…')}>
                          {tx(locale, 'Save changes', 'Simpan perubahan')}
                        </SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            label={tx(locale, 'targets', 'target')}
            makeHref={(p) => `${basePath}?project=${projectId}&tpage=${p}`}
          />
        </div>
      </div>
    </div>
  );
}
