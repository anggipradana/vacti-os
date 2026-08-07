'use client';

import { useState } from 'react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { tx, type Locale } from '../../../../lib/i18n';
import { saveBackupConfigAction } from '../../../../lib/backup-actions';

/**
 * Backup destination + credentials form. Toggles the B2 vs S3/R2 key fields by backend. The secret fields
 * are write-only (never pre-filled from the server, which never returns them). Submitting writes the host
 * env file when the app can reach the host, else it persists non-secret metadata + shows the runbook.
 */
export function BackupConfigForm({
  locale,
  repoType,
  repoRedacted,
  keepDaily,
  keepWeekly,
  keepMonthly,
}: {
  locale: Locale;
  repoType: string;
  repoRedacted: string | null;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
}) {
  const [backend, setBackend] = useState(repoType === 's3' ? 's3' : 'b2');

  return (
    <form action={saveBackupConfigAction} className="space-y-4" autoComplete="off">
      <div className="space-y-1.5">
        <Label htmlFor="repoType">{tx(locale, 'Backend', 'Backend')}</Label>
        <Select id="repoType" name="repoType" value={backend} onChange={(e) => setBackend(e.target.value)}>
          <option value="b2">{tx(locale, 'Backblaze B2 (b2:)', 'Backblaze B2 (b2:)')}</option>
          <option value="s3">{tx(locale, 'S3 / Cloudflare R2 (s3:)', 'S3 / Cloudflare R2 (s3:)')}</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="repository">{tx(locale, 'Repository', 'Repository')}</Label>
        <Input
          id="repository"
          name="repository"
          defaultValue={repoRedacted ?? ''}
          placeholder={backend === 's3' ? 's3:https://<acct>.r2.cloudflarestorage.com/vacti-backup' : 'b2:vacti-backup-xxxx:vacti'}
          spellCheck={false}
          required
        />
        <p className="text-xs text-fg-subtle">
          {tx(
            locale,
            'The restic repository locator (bucket + path). Not a secret.',
            'Locator repository restic (bucket + path). Bukan rahasia.',
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{tx(locale, 'Restic repository password', 'Password repository restic')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={tx(locale, 're-enter to save (never shown)', 'masukkan ulang untuk menyimpan (tidak ditampilkan)')}
          spellCheck={false}
          required
        />
        <p className="text-xs text-fg-subtle">
          {tx(
            locale,
            'Encrypts the repo client-side. Losing it makes the backup unrecoverable. Store a copy in your password manager. Written only to the host env file, never to the app database.',
            'Mengenkripsi repo di sisi klien. Kehilangannya membuat backup tak bisa dipulihkan. Simpan salinan di password manager. Ditulis hanya ke file env host, tidak pernah ke database aplikasi.',
          )}
        </p>
      </div>

      {backend === 'b2' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b2KeyId">{tx(locale, 'B2 key ID', 'B2 key ID')}</Label>
            <Input id="b2KeyId" name="b2KeyId" type="password" spellCheck={false} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b2Key">{tx(locale, 'B2 application key', 'B2 application key')}</Label>
            <Input id="b2Key" name="b2Key" type="password" spellCheck={false} required />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="awsKeyId">{tx(locale, 'Access key ID', 'Access key ID')}</Label>
            <Input id="awsKeyId" name="awsKeyId" type="password" spellCheck={false} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="awsSecret">{tx(locale, 'Secret access key', 'Secret access key')}</Label>
            <Input id="awsSecret" name="awsSecret" type="password" spellCheck={false} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="awsRegion">{tx(locale, 'Region', 'Region')}</Label>
            <Input id="awsRegion" name="awsRegion" defaultValue="auto" spellCheck={false} />
          </div>
        </div>
      )}

      <div>
        <Label>{tx(locale, 'Retention (restic forget)', 'Retensi (restic forget)')}</Label>
        <div className="mt-1.5 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="keepDaily" className="text-xs text-fg-subtle">
              {tx(locale, 'Keep daily', 'Simpan harian')}
            </Label>
            <Input id="keepDaily" name="keepDaily" type="number" min={0} defaultValue={keepDaily} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keepWeekly" className="text-xs text-fg-subtle">
              {tx(locale, 'Keep weekly', 'Simpan mingguan')}
            </Label>
            <Input id="keepWeekly" name="keepWeekly" type="number" min={0} defaultValue={keepWeekly} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keepMonthly" className="text-xs text-fg-subtle">
              {tx(locale, 'Keep monthly', 'Simpan bulanan')}
            </Label>
            <Input id="keepMonthly" name="keepMonthly" type="number" min={0} defaultValue={keepMonthly} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="alertWebhook">{tx(locale, 'Alert webhook (optional)', 'Webhook alert (opsional)')}</Label>
        <Input id="alertWebhook" name="alertWebhook" placeholder="https://..." spellCheck={false} />
        <p className="text-xs text-fg-subtle">
          {tx(
            locale,
            'A webhook that accepts a text form field; fired on backup failure and dead-man alerts. Leave blank to disable.',
            'Webhook yang menerima field text; dipicu saat backup gagal dan alert dead-man. Kosongkan untuk menonaktifkan.',
          )}
        </p>
      </div>

      <SubmitButton variant="primary" pendingText={tx(locale, 'Saving...', 'Menyimpan...')}>
        {tx(locale, 'Save configuration', 'Simpan konfigurasi')}
      </SubmitButton>
    </form>
  );
}
