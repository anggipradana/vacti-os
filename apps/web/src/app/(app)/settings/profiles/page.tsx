import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { FormBanner } from '../../../../components/ui/form-banner';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Label } from '../../../../components/ui/label';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { userCan, Permission } from '@vacti/core';
import { scanProfiles } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { tenantScope, scopeWhereOrGlobal } from '../../../../lib/tenancy';
import { saveProfileAction, editProfileAction, deleteProfileAction } from '../../../../lib/recon-actions';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

const SEVS = ['critical', 'high', 'medium', 'low', 'info'] as const;

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const canEdit = userCan(user, Permission.ModifyScanConfig);
  const t = await tenantScope(user);
  const rows = await getDb()
    .select()
    .from(scanProfiles)
    .where(scopeWhereOrGlobal(t, scanProfiles.projectId))
    .orderBy(desc(scanProfiles.createdAt));
  const sp = await searchParams;

  return (
    <>
      <FormBanner
        ok={sp.ok}
        error={sp.error}
        messages={{ invalid: tx(locale, 'A scan profile needs a name.', 'Scan profile membutuhkan nama.') }}
      />
      <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
        {canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>{tx(locale, 'New scan profile', 'Scan profile baru')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveProfileAction} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{tx(locale, 'Name', 'Nama')}</Label>
                  <Input id="name" name="name" placeholder="e.g. Deep w/ custom UA" required />
                </div>

                <p className="text-xs text-fg-subtle">
                  {tx(
                    locale,
                    'Each tool runs in order and has its own options below. Untick a tool to skip its stage.',
                    'Setiap tool berjalan berurutan dan punya opsi sendiri di bawah. Hapus centang sebuah tool untuk melewati tahapnya.',
                  )}
                </p>

                {/* subfinder - subdomain discovery */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <Checkbox name="tools" value="subfinder" defaultChecked /> subfinder
                  </legend>
                  <p className="text-xs text-fg-subtle">
                    {tx(
                      locale,
                      "Subdomain discovery. Untick to skip and use the target's predefined subdomains.",
                      'Penemuan subdomain. Hapus centang untuk melewati dan memakai subdomain yang sudah ditentukan untuk target.',
                    )}
                  </p>
                </fieldset>

                {/* httpx - HTTP probe */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <Checkbox name="tools" value="httpx" defaultChecked /> httpx
                  </legend>
                  <div className="space-y-1.5">
                    <Label htmlFor="httpxUserAgent">User-Agent</Label>
                    <Input id="httpxUserAgent" name="httpxUserAgent" placeholder="Mozilla/5.0 …" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="httpxRateLimit">Rate limit</Label>
                      <Input id="httpxRateLimit" name="httpxRateLimit" type="number" placeholder="150" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="httpxConcurrency">Threads</Label>
                      <Input id="httpxConcurrency" name="httpxConcurrency" type="number" placeholder="50" />
                    </div>
                  </div>
                </fieldset>

                {/* naabu - port scan */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <Checkbox name="tools" value="naabu" defaultChecked /> naabu
                  </legend>
                  <div className="space-y-1.5">
                    <Label htmlFor="ports">Ports</Label>
                    <Input id="ports" name="ports" defaultValue="top-100" placeholder="top-100 / 80,443 / 1-1000" />
                  </div>
                </fieldset>

                {/* nuclei - vulnerability templates */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <Checkbox name="tools" value="nuclei" defaultChecked /> nuclei
                  </legend>
                  <div className="space-y-1.5">
                    <Label>Severities</Label>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {SEVS.map((s) => (
                        <label key={s} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
                          <Checkbox name="severities" value={s} defaultChecked={s !== 'info'} /> {s}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nucleiTags">tags</Label>
                    <Input id="nucleiTags" name="nucleiTags" placeholder="cve, exposure, misconfig" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nucleiExcludeTags">exclude-tags</Label>
                    <Input id="nucleiExcludeTags" name="nucleiExcludeTags" placeholder="dos, intrusive, fuzzing" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nucleiTemplates">templates (paths)</Label>
                    <Input id="nucleiTemplates" name="nucleiTemplates" placeholder="custom/my-template.yaml" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nucleiUserAgent">User-Agent</Label>
                    <Input id="nucleiUserAgent" name="nucleiUserAgent" placeholder="Mozilla/5.0 …" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="nucleiRateLimit">Rate limit</Label>
                      <Input id="nucleiRateLimit" name="nucleiRateLimit" type="number" placeholder="150" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nucleiConcurrency">Concurrency</Label>
                      <Input id="nucleiConcurrency" name="nucleiConcurrency" type="number" placeholder="25" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nucleiRetries">Retries</Label>
                      <Input id="nucleiRetries" name="nucleiRetries" type="number" placeholder="1" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nucleiExtraArgs">extra args (advanced, allow-listed)</Label>
                    <Input id="nucleiExtraArgs" name="nucleiExtraArgs" placeholder="-follow-redirects -timeout 10" />
                    <p className="text-xs text-fg-subtle">
                      {tx(
                        locale,
                        'Only safe flags pass; unknown flags are dropped server-side.',
                        'Hanya flag aman yang lolos; flag tak dikenal dibuang di sisi server.',
                      )}
                    </p>
                  </div>
                </fieldset>

                {/* wordfence - WordPress templates (auto-runs on detected WP hosts) */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <Checkbox name="tools" value="wordfence" /> wordfence
                  </legend>
                  <p className="text-xs text-fg-subtle">
                    {tx(
                      locale,
                      'WordPress-focused nuclei templates, run automatically on hosts detected as WordPress.',
                      'Template nuclei khusus WordPress, dijalankan otomatis pada host yang terdeteksi sebagai WordPress.',
                    )}
                  </p>
                </fieldset>

                {/* Scope - applies across tools */}
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-medium">{tx(locale, 'Scope', 'Scope')}</legend>
                  <div className="space-y-1.5">
                    <Label htmlFor="excludeSubdomains">
                      {tx(locale, 'Exclude subdomains', 'Kecualikan subdomain')}
                    </Label>
                    <Textarea
                      id="excludeSubdomains"
                      name="excludeSubdomains"
                      rows={2}
                      placeholder={'dev.example.com\nstaging.example.com'}
                    />
                  </div>
                </fieldset>

                <SubmitButton pendingText={tx(locale, 'Saving…', 'Menyimpan…')} className="w-full">
                  {tx(locale, 'Create profile', 'Buat profile')}
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState
              title={tx(locale, 'No scan profiles', 'Belum ada scan profile')}
              description={tx(
                locale,
                'Create a profile to customise tools & scope.',
                'Buat profile untuk menyesuaikan tools & scope.',
              )}
            />
          ) : (
            rows.map((p) => {
              const tools = (p.tools ?? {}) as Record<string, boolean>;
              const cfg = (p.config ?? {}) as Record<string, unknown>;
              const httpxCfg = (cfg.httpx ?? {}) as Record<string, unknown>;
              const nucleiCfg = (cfg.nuclei ?? {}) as Record<string, unknown>;
              const ua = httpxCfg.userAgent ?? nucleiCfg.userAgent ?? cfg.userAgent;
              const rate = httpxCfg.rateLimit ?? nucleiCfg.rateLimit ?? cfg.rateLimit;
              const on = Object.entries(tools)
                .filter(([, v]) => v)
                .map(([k]) => k);
              const sevSet = new Set(p.severities);
              const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
              const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(', ') : '');
              return (
                <Card key={p.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex items-center gap-2">
                        {p.projectId ? null : <Badge variant="neutral">{tx(locale, 'global', 'global')}</Badge>}
                        {canEdit ? (
                          <form action={deleteProfileAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <SubmitButton variant="ghost" size="sm" className="text-danger hover:bg-danger/10">
                              {tx(locale, 'Delete', 'Hapus')}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-fg-muted">
                      <span>tools: {on.join(', ') || '-'}</span>
                      <span>· ports: {p.ports}</span>
                      <span>· sev: {p.severities.join('/')}</span>
                      {ua ? <span>· UA set</span> : null}
                      {rate ? <span>· rate {String(rate)}</span> : null}
                      {Array.isArray(cfg.excludeSubdomains) ? (
                        <span>· excl {(cfg.excludeSubdomains as string[]).length}</span>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
                          {tx(locale, 'Edit', 'Ubah')}
                        </summary>
                        <form action={editProfileAction} className="mt-3 space-y-4">
                          <input type="hidden" name="id" value={p.id} />
                          <div className="space-y-1.5">
                            <Label htmlFor={`name-${p.id}`}>{tx(locale, 'Name', 'Nama')}</Label>
                            <Input id={`name-${p.id}`} name="name" defaultValue={p.name} required />
                          </div>

                          <fieldset className="space-y-2 rounded-md border border-border p-3">
                            <legend className="px-1 text-sm font-medium">{tx(locale, 'Tools', 'Tools')}</legend>
                            <div className="flex flex-wrap gap-3 text-sm">
                              {(['subfinder', 'httpx', 'naabu', 'nuclei', 'wordfence'] as const).map((tk) => (
                                <label key={tk} className="flex items-center gap-1.5">
                                  <Checkbox name="tools" value={tk} defaultChecked={!!tools[tk]} /> {tk}
                                </label>
                              ))}
                            </div>
                          </fieldset>

                          <div className="space-y-1.5">
                            <Label htmlFor={`ports-${p.id}`}>Ports</Label>
                            <Input
                              id={`ports-${p.id}`}
                              name="ports"
                              defaultValue={p.ports}
                              placeholder="top-100 / 80,443 / 1-1000"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Severities</Label>
                            <div className="flex flex-wrap gap-2 text-xs">
                              {SEVS.map((s) => (
                                <label
                                  key={s}
                                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1"
                                >
                                  <Checkbox name="severities" value={s} defaultChecked={sevSet.has(s)} /> {s}
                                </label>
                              ))}
                            </div>
                          </div>

                          <fieldset className="space-y-2 rounded-md border border-border p-3">
                            <legend className="px-1 text-sm font-medium">httpx</legend>
                            <div className="space-y-1.5">
                              <Label htmlFor={`httpxUserAgent-${p.id}`}>User-Agent</Label>
                              <Input
                                id={`httpxUserAgent-${p.id}`}
                                name="httpxUserAgent"
                                defaultValue={str(httpxCfg.userAgent)}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor={`httpxRateLimit-${p.id}`}>Rate limit</Label>
                                <Input
                                  id={`httpxRateLimit-${p.id}`}
                                  name="httpxRateLimit"
                                  type="number"
                                  defaultValue={str(httpxCfg.rateLimit)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`httpxConcurrency-${p.id}`}>Threads</Label>
                                <Input
                                  id={`httpxConcurrency-${p.id}`}
                                  name="httpxConcurrency"
                                  type="number"
                                  defaultValue={str(httpxCfg.concurrency)}
                                />
                              </div>
                            </div>
                          </fieldset>

                          <fieldset className="space-y-2 rounded-md border border-border p-3">
                            <legend className="px-1 text-sm font-medium">nuclei</legend>
                            <div className="space-y-1.5">
                              <Label htmlFor={`nucleiTags-${p.id}`}>tags</Label>
                              <Input
                                id={`nucleiTags-${p.id}`}
                                name="nucleiTags"
                                defaultValue={arr(nucleiCfg.tags)}
                                placeholder="cve, exposure, misconfig"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`nucleiExcludeTags-${p.id}`}>exclude-tags</Label>
                              <Input
                                id={`nucleiExcludeTags-${p.id}`}
                                name="nucleiExcludeTags"
                                defaultValue={arr(nucleiCfg.excludeTags)}
                                placeholder="dos, intrusive, fuzzing"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`nucleiTemplates-${p.id}`}>templates (paths)</Label>
                              <Input
                                id={`nucleiTemplates-${p.id}`}
                                name="nucleiTemplates"
                                defaultValue={arr(nucleiCfg.templates)}
                                placeholder="custom/my-template.yaml"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`nucleiUserAgent-${p.id}`}>User-Agent</Label>
                              <Input
                                id={`nucleiUserAgent-${p.id}`}
                                name="nucleiUserAgent"
                                defaultValue={str(nucleiCfg.userAgent)}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor={`nucleiRateLimit-${p.id}`}>Rate limit</Label>
                                <Input
                                  id={`nucleiRateLimit-${p.id}`}
                                  name="nucleiRateLimit"
                                  type="number"
                                  defaultValue={str(nucleiCfg.rateLimit)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`nucleiConcurrency-${p.id}`}>Concurrency</Label>
                                <Input
                                  id={`nucleiConcurrency-${p.id}`}
                                  name="nucleiConcurrency"
                                  type="number"
                                  defaultValue={str(nucleiCfg.concurrency)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`nucleiRetries-${p.id}`}>Retries</Label>
                                <Input
                                  id={`nucleiRetries-${p.id}`}
                                  name="nucleiRetries"
                                  type="number"
                                  defaultValue={str(nucleiCfg.retries)}
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`nucleiExtraArgs-${p.id}`}>extra args (allow-listed)</Label>
                              <Input
                                id={`nucleiExtraArgs-${p.id}`}
                                name="nucleiExtraArgs"
                                defaultValue={arr(nucleiCfg.extraArgs)}
                                placeholder="-follow-redirects -timeout 10"
                              />
                            </div>
                          </fieldset>

                          <fieldset className="space-y-2 rounded-md border border-border p-3">
                            <legend className="px-1 text-sm font-medium">{tx(locale, 'Scope', 'Scope')}</legend>
                            <div className="space-y-1.5">
                              <Label htmlFor={`excludeSubdomains-${p.id}`}>
                                {tx(locale, 'Exclude subdomains', 'Kecualikan subdomain')}
                              </Label>
                              <Textarea
                                id={`excludeSubdomains-${p.id}`}
                                name="excludeSubdomains"
                                rows={2}
                                defaultValue={
                                  Array.isArray(cfg.excludeSubdomains)
                                    ? (cfg.excludeSubdomains as string[]).join('\n')
                                    : ''
                                }
                                placeholder={'dev.example.com\nstaging.example.com'}
                              />
                            </div>
                          </fieldset>

                          <SubmitButton size="sm" pendingText={tx(locale, 'Saving…', 'Menyimpan…')}>
                            {tx(locale, 'Save changes', 'Simpan perubahan')}
                          </SubmitButton>
                        </form>
                      </details>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
