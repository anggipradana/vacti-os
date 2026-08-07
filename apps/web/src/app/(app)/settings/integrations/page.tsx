import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { ActionForm, ActionSubmit } from '../../../../components/ui/action-form';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import {
  ALL_EVENT_TYPES,
  listProjectSecretNames,
  listProjectSecretChecks,
  getProjectSecret,
} from '@vacti/integrations';
import { decryptSecret } from '@vacti/auth';
import { projects, webhooks, aiSettings, aiDefaults } from '@vacti/db';
import { userCan, Permission } from '@vacti/core';
import { getDb, env } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getActiveProjectId } from '../../../../lib/active-project';
import { ProjectSwitcher } from '../../../../components/project-switcher';
import {
  addWebhookAction,
  deleteWebhookAction,
  editWebhookAction,
  testWebhookAction,
} from '../../../../lib/integration-actions';
import { saveAiSettingsAction, saveAiDefaultsAction, testAiDefaultAction } from '../../../../lib/ai-actions';
import { saveProjectKeyAction, clearProjectKeyAction, testProjectKeyAction } from '../../../../lib/vault-actions';
import { getLocale } from '../../../../lib/locale';
import { tx, type Locale } from '../../../../lib/i18n';

/**
 * A safe, identifiable preview of a stored secret so the operator can SEE a key is filled (and which
 * one) without the value ever being shown in full. Shows the first 3 + last 4 chars, middle masked
 * (industry standard, e.g. `sk-......af9d`); short keys are fully dotted. Computed server-side only.
 */
function maskSecret(plain: string): string {
  const s = (plain ?? '').trim();
  if (s.length <= 8) return '•'.repeat(Math.max(4, s.length));
  return `${s.slice(0, 3)}${'•'.repeat(6)}${s.slice(-4)}`;
}

const vaultKeys = (locale: Locale): { name: string; label: string; hint: string }[] => [
  { name: 'otx', label: 'OTX (AlienVault)', hint: tx(locale, 'Threat-intel pulses', 'Threat-intel pulses') },
  { name: 'leakcheck', label: 'LeakCheck', hint: tx(locale, 'Leaked credentials', 'Kredensial bocor') },
  {
    name: 'virustotal',
    label: 'VirusTotal',
    hint: tx(locale, 'Passive DNS, subdomains & URLs', 'Passive DNS, subdomain & URL'),
  },
  { name: 'urlscan', label: 'URLScan', hint: tx(locale, 'Passive URL / IoC lookups', 'Lookup URL / IoC pasif') },
  { name: 'openai', label: 'OpenAI', hint: tx(locale, 'AI enrichment', 'AI enrichment') },
];

// Provider options shared by the per-project and the system-default AI forms.
const AI_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' },
];

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Integrations hold API keys/secrets + webhooks - SysAdmin only.
  if (!userCan(user, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const VAULT_KEYS = vaultKeys(locale);
  const db = getDb();
  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));
  const sp = await searchParams;
  // Cookie-aware: follow the active project like the other project-scoped pages (a switch persists).
  const projectId = await getActiveProjectId(sp.project, projectRows);

  const hooks = projectId ? await db.select().from(webhooks).where(eq(webhooks.projectId, projectId)) : [];
  const [ai] = projectId ? await db.select().from(aiSettings).where(eq(aiSettings.projectId, projectId)) : [];
  const [aiDefault] = await db.select().from(aiDefaults).where(eq(aiDefaults.id, 'default'));
  const setKeys = projectId ? new Set(await listProjectSecretNames(db, projectId)) : new Set<string>();
  // Persisted validity-check verdicts, keyed by secret name, so the status badge survives reloads.
  const keyChecks = new Map((projectId ? await listProjectSecretChecks(db, projectId) : []).map((c) => [c.name, c]));

  // Masked previews of stored keys so the operator can confirm a key is set (and which one) at a glance,
  // without ever rendering the full secret. Decrypted server-side; only the masked string reaches the client.
  const encKey = env().ENCRYPTION_KEY;
  let aiDefaultPreview: string | null = null;
  if (aiDefault?.apiKeyCiphertext) {
    try {
      aiDefaultPreview = maskSecret(decryptSecret(aiDefault.apiKeyCiphertext, encKey));
    } catch {
      /* a decrypt failure (e.g. rotated key) just omits the preview; the "set" badge still shows */
    }
  }
  const vaultPreviews = new Map<string, string>();
  if (projectId) {
    for (const name of setKeys) {
      try {
        const v = await getProjectSecret(db, projectId, name, encKey);
        if (v) vaultPreviews.set(name, maskSecret(v));
      } catch {
        /* omit preview on decrypt failure */
      }
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {tx(locale, 'Public REST API docs:', 'Dokumentasi REST API publik:')}{' '}
          <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            /api/docs
          </a>{' '}
          · OpenAPI:{' '}
          <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            /api/openapi.json
          </a>
        </p>
        <ProjectSwitcher projects={projectRows} current={projectId} basePath="/settings/integrations" />
      </div>

      {!projectId ? (
        <p className="text-sm text-fg-muted">
          {tx(locale, 'Create a project first.', 'Buat project terlebih dahulu.')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{tx(locale, 'Add webhook', 'Tambah webhook')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={addWebhookAction} className="space-y-3">
                <input type="hidden" name="projectId" value={projectId} />
                <div className="space-y-1">
                  <Label htmlFor="channel">{tx(locale, 'Channel', 'Channel')}</Label>
                  <Select id="channel" name="channel">
                    <option value="discord">Discord</option>
                    <option value="slack">Slack</option>
                    <option value="telegram">Telegram</option>
                    <option value="google_chat">Google Chat</option>
                    <option value="generic">Generic (JSON)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="label">{tx(locale, 'Label', 'Label')}</Label>
                  <Input id="label" name="label" placeholder="Team alerts" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="url">{tx(locale, 'Webhook URL', 'Webhook URL')}</Label>
                  <Input id="url" name="url" placeholder="https://… (Discord/Slack/GChat/Generic)" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="tgtoken">{tx(locale, 'Telegram bot token', 'Telegram bot token')}</Label>
                    <Input id="tgtoken" name="telegramToken" placeholder="for Telegram" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tgchat">{tx(locale, 'Telegram chat id', 'Telegram chat id')}</Label>
                    <Input id="tgchat" name="telegramChatId" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{tx(locale, 'Events (none = all)', 'Event (kosong = semua)')}</Label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {ALL_EVENT_TYPES.map((e) => (
                      <label key={e} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
                        <Checkbox name="events" value={e} /> {e}
                      </label>
                    ))}
                  </div>
                </div>
                <ActionSubmit className="w-full" data-testid="webhook-add">
                  {tx(locale, 'Add webhook', 'Tambah webhook')}
                </ActionSubmit>
              </ActionForm>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {hooks.length === 0 ? (
              <EmptyState
                title={tx(locale, 'No webhooks', 'Belum ada webhook')}
                description={tx(
                  locale,
                  'Add a webhook to get scan & finding notifications.',
                  'Tambahkan webhook untuk menerima notifikasi scan & temuan.',
                )}
              />
            ) : (
              hooks.map((w) => (
                <Card key={w.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{w.label ?? w.channel}</span>{' '}
                        <Badge variant="neutral">{w.channel}</Badge>{' '}
                        <span className="text-xs text-fg-subtle">
                          {w.events.length ? w.events.join(', ') : tx(locale, 'all events', 'semua event')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ActionForm action={testWebhookAction}>
                          <input type="hidden" name="id" value={w.id} />
                          <ActionSubmit variant="outline" size="sm">
                            {tx(locale, 'Test', 'Tes')}
                          </ActionSubmit>
                        </ActionForm>
                        <ActionForm
                          action={deleteWebhookAction}
                          confirm={tx(
                            locale,
                            'Remove this webhook? This cannot be undone.',
                            'Hapus webhook ini? Tindakan ini tidak dapat dibatalkan.',
                          )}
                        >
                          <input type="hidden" name="id" value={w.id} />
                          <ActionSubmit variant="ghost" size="sm" className="text-danger hover:bg-danger/10">
                            {tx(locale, 'Remove', 'Hapus')}
                          </ActionSubmit>
                        </ActionForm>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-accent hover:underline">
                        {tx(locale, 'Edit', 'Ubah')}
                      </summary>
                      <ActionForm
                        action={editWebhookAction}
                        className="mt-3 space-y-3"
                        data-testid={`webhook-edit-${w.id}`}
                      >
                        <input type="hidden" name="id" value={w.id} />
                        <div className="space-y-1">
                          <Label htmlFor={`channel-${w.id}`}>{tx(locale, 'Channel', 'Channel')}</Label>
                          <Select id={`channel-${w.id}`} name="channel" defaultValue={w.channel}>
                            <option value="discord">Discord</option>
                            <option value="slack">Slack</option>
                            <option value="telegram">Telegram</option>
                            <option value="google_chat">Google Chat</option>
                            <option value="generic">Generic (JSON)</option>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`label-${w.id}`}>{tx(locale, 'Label', 'Label')}</Label>
                          <Input
                            id={`label-${w.id}`}
                            name="label"
                            defaultValue={w.label ?? ''}
                            placeholder="Team alerts"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`url-${w.id}`}>{tx(locale, 'Webhook URL', 'Webhook URL')}</Label>
                          <Input
                            id={`url-${w.id}`}
                            name="url"
                            defaultValue={w.url ?? ''}
                            placeholder="https://… (Discord/Slack/GChat/Generic)"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`tgtoken-${w.id}`}>
                              {tx(locale, 'Telegram bot token', 'Telegram bot token')}
                            </Label>
                            <Input
                              id={`tgtoken-${w.id}`}
                              name="telegramToken"
                              defaultValue={w.telegramToken ?? ''}
                              placeholder="for Telegram"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`tgchat-${w.id}`}>
                              {tx(locale, 'Telegram chat id', 'Telegram chat id')}
                            </Label>
                            <Input id={`tgchat-${w.id}`} name="telegramChatId" defaultValue={w.telegramChatId ?? ''} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>{tx(locale, 'Events (none = all)', 'Event (kosong = semua)')}</Label>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {ALL_EVENT_TYPES.map((e) => (
                              <label
                                key={e}
                                className="flex items-center gap-1 rounded-md border border-border px-2 py-1"
                              >
                                <Checkbox name="events" value={e} defaultChecked={w.events.includes(e)} /> {e}
                              </label>
                            ))}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox name="enabled" defaultChecked={w.enabled} /> {tx(locale, 'Enabled', 'Aktif')}
                        </label>
                        <ActionSubmit size="sm" data-testid={`webhook-edit-save-${w.id}`}>
                          {tx(locale, 'Save changes', 'Simpan perubahan')}
                        </ActionSubmit>
                      </ActionForm>
                    </details>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          {tx(locale, 'Default AI enrichment (system)', 'AI enrichment default (sistem)')}
        </h2>
        <Card className="max-w-xl">
          <CardContent className="pt-5">
            <p className="mb-3 text-sm text-fg-muted">
              {tx(
                locale,
                'The default provider used for AI enrichment when a project has not chosen its own below. The system API key works across all projects; a key stored in a project vault overrides it for that project.',
                'Provider default untuk AI enrichment ketika sebuah project belum memilih sendiri di bawah. System API key berlaku untuk semua project; key yang disimpan di vault project menggantikannya untuk project tersebut.',
              )}
            </p>
            <ActionForm action={saveAiDefaultsAction} className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="default-provider">{tx(locale, 'Provider', 'Provider')}</Label>
                  <Select
                    id="default-provider"
                    name="provider"
                    defaultValue={aiDefault?.provider ?? 'openai'}
                    data-testid="ai-default-provider"
                  >
                    {AI_PROVIDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="default-model">{tx(locale, 'Model', 'Model')}</Label>
                  <Input
                    id="default-model"
                    name="model"
                    defaultValue={aiDefault?.model ?? 'gpt-4o-mini'}
                    placeholder="e.g. gpt-4o-mini, gpt-4o"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="default-baseUrl">{tx(locale, 'Base URL (optional)', 'Base URL (opsional)')}</Label>
                <Input
                  id="default-baseUrl"
                  name="baseUrl"
                  type="url"
                  placeholder="https://my-gateway.local/v1  (blank = vendor default)"
                  defaultValue={aiDefault?.baseUrl ?? ''}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="default-apiKey">
                  System API key{' '}
                  {aiDefault?.apiKeyCiphertext ? (
                    <>
                      <Badge variant="success">{tx(locale, 'set', 'terisi')}</Badge>{' '}
                      {aiDefaultPreview ? (
                        <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                          {aiDefaultPreview}
                        </code>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-fg-subtle">
                      ·{' '}
                      {tx(
                        locale,
                        'used by every project without its own key',
                        'dipakai setiap project yang tidak punya key sendiri',
                      )}
                    </span>
                  )}{' '}
                  {aiDefault?.apiKeyCiphertext && aiDefault?.lastCheckStatus ? (
                    <Badge
                      variant={
                        aiDefault.lastCheckStatus === 'valid'
                          ? 'success'
                          : aiDefault.lastCheckStatus === 'invalid'
                            ? 'danger'
                            : 'neutral'
                      }
                      data-testid="ai-default-key-status"
                      title={
                        aiDefault.lastCheckedAt ? `Last checked ${aiDefault.lastCheckedAt.toISOString()}` : undefined
                      }
                    >
                      {aiDefault.lastCheckStatus === 'valid'
                        ? 'valid'
                        : aiDefault.lastCheckStatus === 'invalid'
                          ? 'invalid'
                          : tx(locale, 'check failed', 'cek gagal')}
                    </Badge>
                  ) : null}
                </Label>
                <Input
                  id="default-apiKey"
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    aiDefault?.apiKeyCiphertext
                      ? tx(locale, 'Leave blank to keep the stored key', 'Kosongkan untuk mempertahankan key tersimpan')
                      : 'sk-...'
                  }
                  data-testid="ai-default-key"
                />
                {aiDefault?.apiKeyCiphertext ? (
                  <label className="flex items-center gap-2 pt-1 text-xs text-fg-subtle">
                    <Checkbox name="clearKey" className="size-3.5" />{' '}
                    {tx(locale, 'Remove the stored system key', 'Hapus system key tersimpan')}
                  </label>
                ) : null}
              </div>
              <ActionSubmit
                data-testid="ai-default-save"
                pendingText={tx(locale, 'Saving + testing key...', 'Menyimpan + menguji key...')}
              >
                {tx(locale, 'Save default', 'Simpan default')}
              </ActionSubmit>
            </ActionForm>
            {aiDefault?.apiKeyCiphertext ? (
              <ActionForm action={testAiDefaultAction} className="mt-2">
                <ActionSubmit
                  variant="outline"
                  size="sm"
                  pendingText={tx(locale, 'Testing...', 'Menguji...')}
                  data-testid="ai-default-test"
                >
                  {tx(locale, 'Test stored key', 'Tes key tersimpan')}
                </ActionSubmit>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {projectId ? (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            {tx(locale, 'AI enrichment (this project)', 'AI enrichment (project ini)')}
          </h2>
          <Card className="max-w-xl">
            <CardContent className="pt-5">
              <p className="mb-3 text-sm text-fg-muted">
                {tx(
                  locale,
                  'Provider for vulnerability enrichment (description/impact/remediation) for this project. This OVERRIDES the system default above. Choose "Use system default" to follow it. Set the matching API key in the vault below (or environment); features degrade gracefully without a key.',
                  'Provider untuk vulnerability enrichment (deskripsi/dampak/remediasi) untuk project ini. Ini MENGGANTIKAN system default di atas. Pilih "Pakai system default" untuk mengikutinya. Set API key yang sesuai di vault bawah (atau environment); fitur tetap berjalan dengan baik tanpa key.',
                )}
              </p>
              <ActionForm action={saveAiSettingsAction} className="space-y-3">
                <input type="hidden" name="projectId" value={projectId} />
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="provider">{tx(locale, 'Provider', 'Provider')}</Label>
                    <Select id="provider" name="provider" defaultValue={ai?.provider ?? ''}>
                      <option value="">{tx(locale, 'Use system default', 'Pakai system default')}</option>
                      {AI_PROVIDER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="model">{tx(locale, 'Model', 'Model')}</Label>
                    <Input
                      id="model"
                      name="model"
                      defaultValue={ai?.model ?? 'gpt-4o-mini'}
                      placeholder="e.g. gpt-4o-mini, gpt-4o"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="baseUrl">{tx(locale, 'Base URL (optional)', 'Base URL (opsional)')}</Label>
                  <Input
                    id="baseUrl"
                    name="baseUrl"
                    type="url"
                    placeholder="https://my-gateway.local/v1  (blank = vendor default)"
                    defaultValue={ai?.baseUrl ?? ''}
                  />
                  <p className="text-xs text-fg-subtle">
                    {tx(
                      locale,
                      'Point OpenAI at a compatible endpoint (local proxy, LiteLLM, gateway) if you use one. Leave blank for the official cloud API. (Ollama uses OLLAMA_BASE_URL.)',
                      'Arahkan OpenAI ke endpoint yang kompatibel (proxy lokal, LiteLLM, gateway) jika Anda memakainya. Kosongkan untuk cloud API resmi. (Ollama memakai OLLAMA_BASE_URL.)',
                    )}
                  </p>
                </div>
                <ActionSubmit data-testid="ai-save">{tx(locale, 'Save', 'Simpan')}</ActionSubmit>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {projectId ? (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            {tx(locale, 'API keys (encrypted vault)', 'API key (vault terenkripsi)')}
          </h2>
          <Card className="max-w-2xl">
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm text-fg-muted">
                {tx(
                  locale,
                  'Per-project keys, encrypted at rest (AES-256-GCM). When set, they override the environment defaults. Values are never displayed after saving.',
                  'Key per project, terenkripsi saat disimpan (AES-256-GCM). Ketika diset, key menggantikan default dari environment. Nilai tidak pernah ditampilkan setelah disimpan.',
                )}
              </p>
              {VAULT_KEYS.map((k) => (
                <div
                  key={k.name}
                  className="flex items-end gap-2 border-t border-border pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`key-${k.name}`}>
                      {k.label}{' '}
                      {setKeys.has(k.name) ? (
                        <>
                          <Badge variant="success">{tx(locale, 'set', 'terisi')}</Badge>{' '}
                          {vaultPreviews.get(k.name) ? (
                            <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                              {vaultPreviews.get(k.name)}
                            </code>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-fg-subtle">· {k.hint}</span>
                      )}{' '}
                      {setKeys.has(k.name) && keyChecks.get(k.name)?.status ? (
                        <Badge
                          variant={
                            keyChecks.get(k.name)!.status === 'valid'
                              ? 'success'
                              : keyChecks.get(k.name)!.status === 'invalid'
                                ? 'danger'
                                : 'neutral'
                          }
                          data-testid={`vault-test-result-${k.name}`}
                          title={
                            keyChecks.get(k.name)?.checkedAt
                              ? `Last checked ${keyChecks.get(k.name)!.checkedAt!.toISOString()}`
                              : undefined
                          }
                        >
                          {keyChecks.get(k.name)!.status === 'valid'
                            ? 'valid'
                            : keyChecks.get(k.name)!.status === 'invalid'
                              ? 'invalid'
                              : tx(locale, 'check failed', 'cek gagal')}
                        </Badge>
                      ) : null}
                    </Label>
                    <ActionForm action={saveProjectKeyAction} className="flex items-center gap-2" id={`form-${k.name}`}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="name" value={k.name} />
                      <Input
                        id={`key-${k.name}`}
                        name="value"
                        type="password"
                        data-testid={`vault-input-${k.name}`}
                        placeholder={
                          setKeys.has(k.name)
                            ? tx(locale, '•••••••• (replace)', '•••••••• (ganti)')
                            : tx(locale, 'Paste key…', 'Tempel key…')
                        }
                      />
                      <ActionSubmit variant="outline" size="sm" data-testid={`vault-save-${k.name}`}>
                        {tx(locale, 'Save', 'Simpan')}
                      </ActionSubmit>
                    </ActionForm>
                  </div>
                  {setKeys.has(k.name) ? (
                    <>
                      <ActionForm action={testProjectKeyAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="name" value={k.name} />
                        <ActionSubmit
                          variant="outline"
                          size="sm"
                          pendingText={tx(locale, 'Testing...', 'Menguji...')}
                          data-testid={`vault-test-${k.name}`}
                        >
                          {tx(locale, 'Test', 'Tes')}
                        </ActionSubmit>
                      </ActionForm>
                      <ActionForm action={clearProjectKeyAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="name" value={k.name} />
                        <ActionSubmit
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10"
                          data-testid={`vault-clear-${k.name}`}
                        >
                          {tx(locale, 'Clear', 'Hapus')}
                        </ActionSubmit>
                      </ActionForm>
                    </>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
