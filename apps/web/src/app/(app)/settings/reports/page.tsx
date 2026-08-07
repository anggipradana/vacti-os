import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Badge } from '../../../../components/ui/badge';
import { projects, reportSettings, reportSignatories } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getActiveProjectId } from '../../../../lib/active-project';
import { tenantScope, scopeWhere } from '../../../../lib/tenancy';
import { ProjectSwitcher } from '../../../../components/project-switcher';
import {
  saveReportSettingsAction,
  addSignatoryAction,
  editSignatoryAction,
  deleteSignatoryAction,
} from '../../../../lib/report-actions';
import { ExecSummaryButton } from './exec-summary-button';
import { getLocale } from '../../../../lib/locale';
import { tx, type Locale } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

const fields = (locale: Locale): { name: string; label: string }[] => [
  { name: 'companyName', label: tx(locale, 'Company name', 'Nama perusahaan') },
  { name: 'companyAddress', label: tx(locale, 'Address', 'Alamat') },
  { name: 'companyWebsite', label: tx(locale, 'Website', 'Website') },
  { name: 'companyEmail', label: tx(locale, 'Email', 'Email') },
  { name: 'documentNumber', label: tx(locale, 'Document number', 'Nomor dokumen') },
];

export default async function ReportSettingsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const FIELDS = fields(locale);
  const db = getDb();
  const t = await tenantScope(user);
  const projectRows = await db
    .select()
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));
  const sp = await searchParams;
  // Cookie-aware: must follow the ACTIVE project. Defaulting to the newest project made the AI
  // exec-summary (and branding edits) silently target the wrong project.
  const projectId = await getActiveProjectId(sp.project, projectRows);

  if (!projectId) {
    return (
      <p className="text-sm text-fg-muted">{tx(locale, 'Create a project first.', 'Buat project terlebih dahulu.')}</p>
    );
  }

  const [allSettings, signatories] = await Promise.all([
    db.select().from(reportSettings).where(eq(reportSettings.projectId, projectId)),
    db.select().from(reportSignatories).where(eq(reportSignatories.projectId, projectId)),
  ]);
  const get = (kind: string) => allSettings.find((s) => s.kind === kind);

  const brandingForm = (kind: 'va' | 'ti') => {
    const s = get(kind);
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {kind === 'va'
              ? tx(locale, 'VA report branding', 'Branding laporan VA')
              : tx(locale, 'TI report branding', 'Branding laporan TI')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveReportSettingsAction} className="space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="kind" value={kind} />
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label htmlFor={`${kind}-${f.name}`}>{f.label}</Label>
                <Input
                  id={`${kind}-${f.name}`}
                  name={f.name}
                  defaultValue={(s?.[f.name as keyof typeof s] as string) ?? ''}
                />
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${kind}-primary`}>{tx(locale, 'Primary (teal)', 'Primer (teal)')}</Label>
                <Input
                  id={`${kind}-primary`}
                  name="primaryColor"
                  type="color"
                  className="h-9 p-1"
                  defaultValue={s?.primaryColor ?? '#069ec6'}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${kind}-secondary`}>{tx(locale, 'Cover (navy)', 'Sampul (navy)')}</Label>
                <Input
                  id={`${kind}-secondary`}
                  name="secondaryColor"
                  type="color"
                  className="h-9 p-1"
                  defaultValue={s?.secondaryColor ?? '#08222b'}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${kind}-lang`}>{tx(locale, 'Language', 'Bahasa')}</Label>
                <Select id={`${kind}-lang`} name="language" defaultValue={s?.language ?? 'en'}>
                  <option value="en">English</option>
                  <option value="id">Indonesia</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${kind}-classif`}>{tx(locale, 'Classification', 'Klasifikasi')}</Label>
              <Input
                id={`${kind}-classif`}
                name="classification"
                defaultValue={s?.classification ?? 'CONFIDENTIAL - FOR INTERNAL USE ONLY'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${kind}-footer`}>{tx(locale, 'Footer text', 'Teks footer')}</Label>
              <Input id={`${kind}-footer`} name="footerText" defaultValue={s?.footerText ?? 'CONFIDENTIAL'} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${kind}-logo`}>{tx(locale, 'Company logo (cover)', 'Logo perusahaan (sampul)')}</Label>
              {s?.companyLogo ? (
                <div className="flex items-center gap-3">
                  <img
                    src={s.companyLogo}
                    alt="logo"
                    className="h-9 max-w-[120px] rounded border border-border object-contain"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Checkbox name="removeLogo" /> {tx(locale, 'Remove', 'Hapus')}
                  </label>
                </div>
              ) : null}
              <Input id={`${kind}-logo`} name="companyLogoFile" type="file" accept="image/*" className="h-9 py-1.5" />
              <p className="text-xs text-fg-subtle">
                {tx(
                  locale,
                  'PNG/SVG/JPG, ≤ 600 KB. Falls back to a monogram.',
                  'PNG/SVG/JPG, ≤ 600 KB. Jika kosong memakai monogram.',
                )}
              </p>
            </div>
            {kind === 'va' ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    id="va-exec-show"
                    name="showExecutiveSummary"
                    defaultChecked={s?.showExecutiveSummary ?? false}
                  />
                  {tx(locale, 'Use custom executive summary', 'Pakai ringkasan eksekutif kustom')}
                </label>
                <p className="text-xs text-fg-subtle">
                  {tx(locale, 'Placeholders:', 'Placeholder:')} {'{company_name}'} {'{target_name}'}{' '}
                  {'{subdomain_count}'} {'{vulnerability_count}'} {'{critical_count}'} {'{high_count}'}{' '}
                  {'{active_count}'} {'{scan_date}'}
                </p>
                <Textarea
                  id="va-exec-en"
                  name="executiveSummary"
                  rows={4}
                  placeholder="Executive summary (English)…"
                  defaultValue={s?.executiveSummary ?? ''}
                />
                <Textarea
                  id="va-exec-id"
                  name="executiveSummaryId"
                  rows={4}
                  placeholder="Ringkasan eksekutif (Indonesia)…"
                  defaultValue={s?.executiveSummaryId ?? ''}
                />
              </div>
            ) : null}
            <SubmitButton>{tx(locale, 'Save', 'Simpan')}</SubmitButton>
          </form>
          {kind === 'va' ? <ExecSummaryButton projectId={projectId} locale={locale} /> : null}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {tx(
            locale,
            'PDF report branding, executive summary and signatories for',
            'Branding laporan PDF, ringkasan eksekutif, dan penanda tangan untuk',
          )}{' '}
          <span className="font-medium text-fg">
            {projectRows.find((p) => p.id === projectId)?.name ?? tx(locale, 'project', 'project')}
          </span>
          .
        </p>
        <ProjectSwitcher projects={projectRows} current={projectId} basePath="/settings/reports" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {brandingForm('va')}
        {brandingForm('ti')}
      </div>

      <h2 className="mb-3 mt-8 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
        {tx(
          locale,
          'Signatories (Prepared / Reviewed / Approved)',
          'Penanda tangan (Disiapkan / Ditinjau / Disetujui)',
        )}
      </h2>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardContent className="pt-5">
            <form action={addSignatoryAction} className="space-y-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="space-y-1">
                <Label htmlFor="role">{tx(locale, 'Role', 'Peran')}</Label>
                <Select id="role" name="role">
                  <option value="prepared">{tx(locale, 'Prepared By', 'Disiapkan Oleh')}</option>
                  <option value="reviewed">{tx(locale, 'Reviewed By', 'Ditinjau Oleh')}</option>
                  <option value="approved">{tx(locale, 'Approved By', 'Disetujui Oleh')}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="signame">{tx(locale, 'Name', 'Nama')}</Label>
                <Input id="signame" name="name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sigpos">{tx(locale, 'Position', 'Jabatan')}</Label>
                <Input id="sigpos" name="position" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sigimg">{tx(locale, 'Signature image', 'Gambar tanda tangan')}</Label>
                <Input id="sigimg" name="signatureImageFile" type="file" accept="image/*" className="h-9 py-1.5" />
              </div>
              <SubmitButton className="w-full">{tx(locale, 'Add signatory', 'Tambah penanda tangan')}</SubmitButton>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {signatories.length === 0 ? (
            <Card>
              <CardContent className="py-5 text-sm text-fg-muted">
                {tx(locale, 'No signatories yet.', 'Belum ada penanda tangan.')}
              </CardContent>
            </Card>
          ) : (
            signatories
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => (
                <Card key={s.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {s.signatureImage ? (
                          <img src={s.signatureImage} alt="" className="h-8 max-w-[80px] object-contain" />
                        ) : null}
                        <div>
                          <span className="font-medium">{s.name}</span>{' '}
                          <span className="text-fg-subtle">{s.position}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="accent">{s.role}</Badge>
                        <form action={deleteSignatoryAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton
                            confirm={tx(locale, 'Remove this signatory?', 'Hapus penanda tangan ini?')}
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10"
                          >
                            {tx(locale, 'Remove', 'Hapus')}
                          </ConfirmButton>
                        </form>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
                        {tx(locale, 'Edit', 'Ubah')}
                      </summary>
                      <form action={editSignatoryAction} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={s.id} />
                        <Select name="role" defaultValue={s.role} aria-label={tx(locale, 'Role', 'Peran')}>
                          <option value="prepared">{tx(locale, 'Prepared By', 'Disiapkan Oleh')}</option>
                          <option value="reviewed">{tx(locale, 'Reviewed By', 'Ditinjau Oleh')}</option>
                          <option value="approved">{tx(locale, 'Approved By', 'Disetujui Oleh')}</option>
                        </Select>
                        <Input name="name" defaultValue={s.name} placeholder={tx(locale, 'Name', 'Nama')} required />
                        <Input
                          name="position"
                          defaultValue={s.position}
                          placeholder={tx(locale, 'Position', 'Jabatan')}
                        />
                        <Input name="signatureImageFile" type="file" accept="image/*" className="h-9 py-1.5" />
                        <SubmitButton size="sm" variant="outline">
                          {tx(locale, 'Save', 'Simpan')}
                        </SubmitButton>
                      </form>
                    </details>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </div>
    </>
  );
}
