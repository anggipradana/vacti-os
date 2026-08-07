import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { Badge } from '../../../../components/ui/badge';
import { userCan, Permission } from '@vacti/core';
import { targets, reconNotes } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { addNoteAction, editNoteAction, toggleNoteAction, deleteNoteAction } from '../../../../lib/recon-actions';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function TargetDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const { id } = await params;
  const db = getDb();
  const [target] = await db.select().from(targets).where(eq(targets.id, id));
  if (!target) notFound();
  await requireProjectMember(user, target.projectId);
  const notes = await db
    .select()
    .from(reconNotes)
    .where(eq(reconNotes.targetId, id))
    .orderBy(desc(reconNotes.createdAt));
  const headers = (target.customHeaders as Record<string, string> | null) ?? null;
  const canEdit = userCan(user, Permission.ModifyTargets);

  return (
    <>
      <div className="mb-6">
        <Link href="/scans" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {tx(locale, 'Targets', 'Target')}
        </Link>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{target.domain}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tx(locale, 'Configuration', 'Konfigurasi')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div>
              <div className="text-xs text-fg-subtle">
                {tx(locale, 'Predefined subdomains', 'Subdomain yang ditentukan')}
              </div>
              {target.predefinedSubdomains.length ? (
                <div className="mt-1 font-mono text-xs">{target.predefinedSubdomains.join(', ')}</div>
              ) : (
                <div className="text-fg-muted">- {tx(locale, 'discovery on', 'discovery aktif')}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-fg-subtle">
                {tx(locale, 'Custom request headers', 'Header request kustom')}
              </div>
              {headers ? (
                <div className="mt-1 space-y-0.5 font-mono text-xs">
                  {Object.keys(headers).map((k) => (
                    <div key={k}>
                      {k}: <span className="text-fg-subtle">••••••</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-fg-muted">- {tx(locale, 'none', 'tidak ada')}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tx(locale, 'Recon notes & TODOs', 'Catatan recon & TODO')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {canEdit ? (
              <form action={addNoteAction} className="flex items-center gap-2">
                <input type="hidden" name="targetId" value={target.id} />
                <Input
                  name="body"
                  placeholder={tx(locale, 'Add a note or TODO…', 'Tambahkan catatan atau TODO…')}
                  required
                />
                <SubmitButton size="sm">{tx(locale, 'Add', 'Tambah')}</SubmitButton>
              </form>
            ) : null}
            {notes.length === 0 ? (
              <p className="py-2 text-sm text-fg-muted">{tx(locale, 'No notes yet.', 'Belum ada catatan.')}</p>
            ) : (
              <ul className="space-y-1">
                {notes.map((n) => (
                  <li key={n.id} className="border-b border-border py-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={n.done ? 'text-sm text-fg-subtle line-through' : 'text-sm'}>{n.body}</span>
                      <div className="flex items-center gap-1">
                        {n.done ? <Badge variant="success">{tx(locale, 'done', 'selesai')}</Badge> : null}
                        {canEdit ? (
                          <>
                            <form action={toggleNoteAction}>
                              <input type="hidden" name="id" value={n.id} />
                              <input type="hidden" name="targetId" value={target.id} />
                              <SubmitButton variant="ghost" size="sm">
                                {n.done ? tx(locale, 'Reopen', 'Buka lagi') : tx(locale, 'Done', 'Selesai')}
                              </SubmitButton>
                            </form>
                            <form action={deleteNoteAction}>
                              <input type="hidden" name="id" value={n.id} />
                              <input type="hidden" name="targetId" value={target.id} />
                              <SubmitButton
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10"
                                aria-label={tx(locale, 'Delete note', 'Hapus catatan')}
                                title={tx(locale, 'Delete note', 'Hapus catatan')}
                              >
                                <Trash2 className="size-4" />
                              </SubmitButton>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
                          {tx(locale, 'Edit', 'Ubah')}
                        </summary>
                        <form action={editNoteAction} className="mt-2 flex items-center gap-2">
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="targetId" value={target.id} />
                          <Input name="body" defaultValue={n.body} required />
                          <SubmitButton size="sm">{tx(locale, 'Save', 'Simpan')}</SubmitButton>
                        </form>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
