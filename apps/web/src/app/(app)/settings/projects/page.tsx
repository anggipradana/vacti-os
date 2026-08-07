import { redirect } from 'next/navigation';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { FolderKanban } from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/card';
import { FormBanner } from '../../../../components/ui/form-banner';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Pagination } from '../../../../components/ui/pagination';
import { Select } from '../../../../components/ui/select';
import { userCan, Permission } from '@vacti/core';
import { SECTORS } from '@vacti/threat-intel';
import { projects, projectMembers, users } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import {
  createProjectAction,
  deleteProjectAction,
  setDefaultProjectAction,
  editProjectAction,
  addProjectMemberAction,
  removeProjectMemberAction,
} from '../../../../lib/actions';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

const PAGE = 20;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ ppage?: string; error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const canManage = userCan(user, Permission.ModifyTargets);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.ppage ?? 1) || 1);
  const db = getDb();
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ n: count() }).from(projects),
  ]);
  const total = Number(countRows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  // Fetch all members for the listed projects in one query, then group in JS (avoid N+1).
  const projectIds = rows.map((p) => p.id);
  const memberRows = projectIds.length
    ? await db
        .select({
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          email: users.email,
          role: projectMembers.role,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(inArray(projectMembers.projectId, projectIds))
    : [];
  const membersByProject = new Map<string, typeof memberRows>();
  for (const m of memberRows) {
    const list = membersByProject.get(m.projectId) ?? [];
    list.push(m);
    membersByProject.set(m.projectId, list);
  }
  return (
    <>
      <FormBanner
        ok={sp.ok}
        error={sp.error}
        messages={{
          invalid: tx(
            locale,
            'Enter a name and a slug (lowercase letters, numbers, hyphens).',
            'Masukkan nama dan slug (huruf kecil, angka, tanda hubung).',
          ),
          nouser: tx(
            locale,
            'No user found with that email address.',
            'Tidak ada pengguna dengan alamat email tersebut.',
          ),
          lastmember: tx(
            locale,
            'A project must keep at least one member.',
            'Project harus memiliki minimal satu anggota.',
          ),
        }}
      />
      <p className="mb-4 text-sm text-fg-muted">
        {tx(
          locale,
          'Workspaces that scope your targets, scans, and findings.',
          'Workspace yang membatasi target, scan, dan temuan Anda.',
        )}
      </p>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardContent className="pt-5">
            <form action={createProjectAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">{tx(locale, 'Name', 'Nama')}</Label>
                <Input id="name" name="name" data-testid="project-name" placeholder="Acme Corp" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">{tx(locale, 'Slug', 'Slug')}</Label>
                <Input id="slug" name="slug" data-testid="project-slug" placeholder="acme-corp" required />
              </div>
              <SubmitButton data-testid="create-project" className="w-full">
                {tx(locale, 'Create project', 'Buat project')}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
        <div data-testid="project-list" className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title={tx(locale, 'No projects yet', 'Belum ada project')}
              description={tx(
                locale,
                'Create your first workspace to get started.',
                'Buat workspace pertama Anda untuk memulai.',
              )}
            />
          ) : (
            rows.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {p.isDefault ? (
                          <Badge variant="accent" className="text-[10px]">
                            {tx(locale, 'Default', 'Default')}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-fg-subtle">/{p.slug}</div>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1.5">
                        {!p.isDefault ? (
                          <form action={setDefaultProjectAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <SubmitButton size="sm" variant="outline">
                              {tx(locale, 'Set default', 'Jadikan default')}
                            </SubmitButton>
                          </form>
                        ) : null}
                        <form action={deleteProjectAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <ConfirmButton
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger/10"
                            confirm={tx(
                              locale,
                              `Delete project "${p.name}" and ALL its targets, scans, findings and TI data? This cannot be undone.`,
                              `Hapus project "${p.name}" dan SEMUA target, scan, temuan, dan data TI-nya? Tindakan ini tidak dapat dibatalkan.`,
                            )}
                          >
                            {tx(locale, 'Delete', 'Hapus')}
                          </ConfirmButton>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  {canManage ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-fg-subtle">{tx(locale, 'Edit', 'Ubah')}</summary>
                      <form action={editProjectAction} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="id" value={p.id} />
                        <div className="space-y-1.5">
                          <Label htmlFor={`name-${p.id}`}>{tx(locale, 'Name', 'Nama')}</Label>
                          <Input id={`name-${p.id}`} name="name" defaultValue={p.name} required className="w-48" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sector-${p.id}`}>{tx(locale, 'Sector', 'Sektor')}</Label>
                          <Select id={`sector-${p.id}`} name="sector" defaultValue={p.sector} className="w-40">
                            {Object.keys(SECTORS).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`slug-${p.id}`}>{tx(locale, 'Slug', 'Slug')}</Label>
                          <Input id={`slug-${p.id}`} name="slug" defaultValue={p.slug} className="w-40" />
                        </div>
                        <SubmitButton size="sm">{tx(locale, 'Save', 'Simpan')}</SubmitButton>
                      </form>
                    </details>
                  ) : null}
                  {canManage ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-2 text-xs font-medium text-fg-subtle">{tx(locale, 'Members', 'Anggota')}</div>
                      <ul className="space-y-1">
                        {(membersByProject.get(p.id) ?? []).map((m) => (
                          <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs">{m.email}</span>
                              <Badge variant="neutral" className="text-[10px]">
                                {m.role}
                              </Badge>
                            </span>
                            <form action={removeProjectMemberAction}>
                              <input type="hidden" name="projectId" value={p.id} />
                              <input type="hidden" name="userId" value={m.userId} />
                              <ConfirmButton
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:bg-danger/10"
                                confirm={tx(
                                  locale,
                                  `Remove ${m.email} from "${p.name}"?`,
                                  `Hapus ${m.email} dari "${p.name}"?`,
                                )}
                              >
                                {tx(locale, 'Remove', 'Hapus')}
                              </ConfirmButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                      <form action={addProjectMemberAction} className="mt-2 flex items-end gap-2">
                        <input type="hidden" name="projectId" value={p.id} />
                        <Input
                          name="email"
                          type="email"
                          placeholder={tx(locale, 'Member email', 'Email anggota')}
                          required
                          className="w-56"
                        />
                        <SubmitButton size="sm" variant="outline">
                          {tx(locale, 'Add member', 'Tambah anggota')}
                        </SubmitButton>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            label={tx(locale, 'projects', 'project')}
            makeHref={(p) => '/settings/projects?ppage=' + p}
          />
        </div>
      </div>
    </>
  );
}
