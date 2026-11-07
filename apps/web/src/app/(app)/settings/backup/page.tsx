import { redirect } from 'next/navigation';
import { HardDriveDownload, ShieldCheck, Clock, Server, TriangleAlert, FileClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { FormBanner } from '../../../../components/ui/form-banner';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { userCan, Permission } from '@vacti/core';
import { getCurrentUser } from '../../../../lib/session';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';
import {
  readBackupStatus,
  initRepoAction,
  runBackupNowAction,
  setScheduleAction,
  verifyRepoAction,
  dryRunRestoreAction,
  clearBackupConfigAction,
} from '../../../../lib/backup-actions';
import { BackupConfigForm } from './config-form';

export const dynamic = 'force-dynamic';

/**
 * Settings > Backup (SysAdmin / ModifySystemConfig). A UI over the host-side restic backup system in
 * ops/backup/. The backup toolchain (restic, systemd timers, /etc/vacti/backup.env) is root-owned on the
 * host; the control-plane app usually runs in a container that cannot reach it. Every host action is
 * attempted for real and, when the host bridge is not reachable, the UI shows the exact command to run
 * instead of faking success. Secrets are only ever written to the host env file, never stored/returned.
 */
export default async function BackupPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const sp = await searchParams;
  const s = await readBackupStatus();
  const m = s.meta;

  const okMessages: Record<string, string> = {
    config_written: tx(locale, 'Configuration written to the host and saved.', 'Konfigurasi ditulis ke host dan disimpan.'),
    config_saved_no_host: tx(
      locale,
      'Configuration saved. The app could not reach the host to write /etc/vacti/backup.env - run the install command below on the host.',
      'Konfigurasi disimpan. Aplikasi tidak dapat menjangkau host untuk menulis /etc/vacti/backup.env - jalankan perintah install di bawah pada host.',
    ),
    config_cleared: tx(locale, 'Stored configuration cleared.', 'Konfigurasi tersimpan dihapus.'),
    inited: tx(locale, 'Repository initialised.', 'Repository diinisialisasi.'),
    run_started: tx(locale, 'Backup started in the background. Refresh for progress.', 'Backup dimulai di latar belakang. Segarkan untuk progres.'),
    schedule_set: tx(locale, 'Schedule updated.', 'Jadwal diperbarui.'),
    verified: tx(locale, 'Repository verified.', 'Repository terverifikasi.'),
    dry_run_done: tx(locale, 'Dry-run complete. See the plan below.', 'Dry-run selesai. Lihat rencana di bawah.'),
    unavailable: tx(
      locale,
      'The host backup toolchain is not reachable from the app. Use the command shown for this action on the host.',
      'Toolchain backup host tidak terjangkau dari aplikasi. Gunakan perintah yang ditampilkan untuk aksi ini pada host.',
    ),
    op_failed: tx(locale, 'The host command ran but returned an error. See the output below.', 'Perintah host berjalan tetapi mengembalikan error. Lihat output di bawah.'),
  };
  const errMessages: Record<string, string> = {
    missing: tx(locale, 'Fill in the repository, password, and the backend keys.', 'Isi repository, password, dan key backend.'),
  };

  const cmd = (c: string) => (
    <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg">
      <code>{c}</code>
    </pre>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <HardDriveDownload className="size-5" />
          {tx(locale, 'Backup', 'Backup')}
        </h1>
        <p className="text-sm text-fg-subtle">
          {tx(
            locale,
            'Encrypted offsite backup of the whole control-plane (Postgres, .data, secrets) to Backblaze B2 or any S3/R2 bucket, with a tested restore. Powered by restic (ops/backup).',
            'Backup offsite terenkripsi seluruh control-plane (Postgres, .data, secret) ke Backblaze B2 atau bucket S3/R2, dengan restore teruji. Ditenagai restic (ops/backup).',
          )}
        </p>
      </div>

      <FormBanner ok={sp.ok} error={sp.error} messages={{ ...okMessages, ...errMessages }} />

      {/* Host-boundary notice: be explicit about what runs here vs on the host. */}
      {!s.hostBridge ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">
              {tx(locale, 'Host backup toolchain not reachable from this app', 'Toolchain backup host tidak terjangkau dari aplikasi ini')}
            </p>
            <p className="mt-0.5 text-fg-muted">
              {tx(
                locale,
                'The control-plane runs in a container and cannot exec host restic/systemctl or read root-owned status directly. Configuration you save here is stored (no secrets) and the exact host commands are shown for each action to run over SSH. Wire the app to the host (or run it on the host) to execute these buttons directly.',
                'Control-plane berjalan dalam container dan tidak dapat menjalankan restic/systemctl host atau membaca status milik root secara langsung. Konfigurasi yang Anda simpan di sini disimpan (tanpa secret) dan perintah host yang tepat ditampilkan untuk setiap aksi agar dijalankan via SSH. Hubungkan aplikasi ke host (atau jalankan di host) untuk mengeksekusi tombol ini langsung.',
              )}
            </p>
          </div>
        </div>
      ) : null}

      {/* 1. Status ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {tx(locale, 'Status', 'Status')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={s.hostBridge ? 'success' : 'neutral'}>
              {tx(locale, 'Host bridge', 'Host bridge')}: {s.hostBridge ? tx(locale, 'reachable', 'terjangkau') : tx(locale, 'not reachable', 'tidak terjangkau')}
            </Badge>
            <Badge variant={s.configuredInApp ? 'success' : 'neutral'}>
              {tx(locale, 'Config', 'Config')}: {s.configuredInApp ? tx(locale, 'saved', 'tersimpan') : tx(locale, 'not set', 'belum diatur')}
            </Badge>
            <Badge variant={s.envPresent ? 'success' : 'neutral'}>
              {tx(locale, 'Host env', 'Env host')}: {s.envPresent ? tx(locale, 'filled', 'terisi') : tx(locale, 'unknown/empty', 'tidak diketahui/kosong')}
            </Badge>
            <Badge variant={m.scheduleEnabled ? 'success' : 'neutral'}>
              {tx(locale, 'Schedule', 'Jadwal')}: {m.scheduleEnabled ? tx(locale, 'enabled', 'aktif') : tx(locale, 'disabled', 'nonaktif')}
            </Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 border-b border-border/60 py-1">
              <dt className="text-fg-subtle">{tx(locale, 'Repository', 'Repository')}</dt>
              <dd className="truncate font-mono text-xs">{m.repoRedacted ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/60 py-1">
              <dt className="text-fg-subtle">{tx(locale, 'Retention (d/w/m)', 'Retensi (h/m/b)')}</dt>
              <dd className="font-mono text-xs">{m.keepDaily}/{m.keepWeekly}/{m.keepMonthly}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/60 py-1">
              <dt className="text-fg-subtle">{tx(locale, 'Last run', 'Terakhir jalan')}</dt>
              <dd className="text-xs">
                {m.lastRunAt ? new Date(m.lastRunAt).toLocaleString() : '-'}
                {m.lastRunStatus ? <span className="ml-1 text-fg-subtle">({m.lastRunStatus})</span> : null}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/60 py-1">
              <dt className="text-fg-subtle">{tx(locale, 'Snapshots', 'Snapshot')}</dt>
              <dd className="text-xs">{s.snapshots ? s.snapshots.length : tx(locale, 'n/a', 'n/a')}</dd>
            </div>
          </dl>
          {s.lastFailure ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {tx(locale, 'Last recorded failure:', 'Kegagalan terakhir tercatat:')} {s.lastFailure}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. Configuration ---------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-4" />
            {tx(locale, 'Destination and credentials', 'Tujuan dan kredensial')}
          </CardTitle>
          <CardDescription>
            {tx(
              locale,
              'Where backups go and the keys to reach it. Secret fields are write-only: they are written to /etc/vacti/backup.env (mode 600) on the host and are never stored in the app or shown again. Re-enter all fields to change anything.',
              'Ke mana backup disimpan dan key untuk menjangkaunya. Field secret bersifat write-only: ditulis ke /etc/vacti/backup.env (mode 600) pada host dan tidak pernah disimpan di aplikasi atau ditampilkan lagi. Masukkan ulang semua field untuk mengubah.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BackupConfigForm
            locale={locale}
            repoType={m.repoType}
            repoRedacted={m.repoRedacted}
            keepDaily={m.keepDaily}
            keepWeekly={m.keepWeekly}
            keepMonthly={m.keepMonthly}
          />
          {s.configuredInApp ? (
            <form action={clearBackupConfigAction} className="border-t border-border pt-4">
              <p className="mb-2 text-xs text-fg-subtle">
                {tx(
                  locale,
                  'Clear the stored configuration metadata in the app. This does not delete the host env file - to remove it run: sudo rm -f ' + s.envPath,
                  'Hapus metadata konfigurasi tersimpan di aplikasi. Ini tidak menghapus file env host - untuk menghapusnya jalankan: sudo rm -f ' + s.envPath,
                )}
              </p>
              <ConfirmButton
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10"
                confirm={tx(locale, 'Clear stored backup configuration metadata?', 'Hapus metadata konfigurasi backup tersimpan?')}
              >
                {tx(locale, 'Clear stored configuration', 'Hapus konfigurasi tersimpan')}
              </ConfirmButton>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* 3. Schedule + run now ------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            {tx(locale, 'Schedule and run', 'Jadwal dan jalankan')}
          </CardTitle>
          <CardDescription>
            {tx(
              locale,
              'Nightly at 03:15 Asia/Jakarta, weekly deep verify Sunday 04:30, daily dead-man 06:00. Initialise the repo once before the first backup.',
              'Setiap malam 03:15 Asia/Jakarta, verify mendalam mingguan Minggu 04:30, dead-man harian 06:00. Inisialisasi repo sekali sebelum backup pertama.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <form action={initRepoAction}>
              <SubmitButton variant="secondary" size="sm" pendingText={tx(locale, 'Working...', 'Memproses...')}>
                {tx(locale, 'Initialise repository', 'Inisialisasi repository')}
              </SubmitButton>
            </form>
            <form action={runBackupNowAction}>
              <SubmitButton variant="primary" size="sm" pendingText={tx(locale, 'Starting...', 'Memulai...')}>
                {tx(locale, 'Run backup now', 'Jalankan backup sekarang')}
              </SubmitButton>
            </form>
            {m.scheduleEnabled ? (
              <form action={setScheduleAction}>
                <input type="hidden" name="enable" value="0" />
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  confirm={tx(locale, 'Disable the nightly backup timers?', 'Nonaktifkan timer backup malam?')}
                >
                  {tx(locale, 'Disable schedule', 'Nonaktifkan jadwal')}
                </ConfirmButton>
              </form>
            ) : (
              <form action={setScheduleAction}>
                <input type="hidden" name="enable" value="1" />
                <SubmitButton variant="secondary" size="sm" pendingText={tx(locale, 'Enabling...', 'Mengaktifkan...')}>
                  {tx(locale, 'Enable schedule', 'Aktifkan jadwal')}
                </SubmitButton>
              </form>
            )}
          </div>
          {!s.hostBridge ? (
            <div className="text-xs text-fg-subtle">
              {tx(locale, 'On the host instead:', 'Pada host:')}
              {cmd(
                `sudo bash -c 'set -a; . ${s.envPath}; set +a; restic init'\n` +
                  `sudo ${s.scriptDir}/backup.sh\n` +
                  `sudo systemctl enable --now vacti-backup.timer vacti-backup-verify.timer vacti-backup-deadman.timer`,
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 4. Snapshots + log --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="size-4" />
            {tx(locale, 'Snapshots and last run', 'Snapshot dan run terakhir')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.snapshots && s.snapshots.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>{tx(locale, 'ID', 'ID')}</TH>
                    <TH>{tx(locale, 'Time', 'Waktu')}</TH>
                    <TH>{tx(locale, 'Host', 'Host')}</TH>
                    <TH>{tx(locale, 'Tags', 'Tag')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.snapshots.map((snap) => (
                    <TR key={snap.id}>
                      <TD className="font-mono text-xs">{snap.id}</TD>
                      <TD className="text-xs">{snap.time ? new Date(snap.time).toLocaleString() : '-'}</TD>
                      <TD className="text-xs">{snap.hostname ?? '-'}</TD>
                      <TD className="text-xs">{snap.tags?.join(', ') ?? '-'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">
              {s.snapshotsError
                ? s.snapshotsError
                : tx(
                    locale,
                    'No snapshots to show. They appear once the host env is filled, the repo is initialised, and the app can reach the host.',
                    'Tidak ada snapshot. Muncul setelah env host terisi, repo diinisialisasi, dan aplikasi dapat menjangkau host.',
                  )}
            </p>
          )}
          {s.logTail ? (
            <div>
              <p className="mb-1 text-xs font-medium text-fg-subtle">{tx(locale, 'Backup log (tail)', 'Log backup (tail)')}</p>
              <pre className="max-h-52 overflow-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                <code>{s.logTail}</code>
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 5. Restore ----------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="size-4" />
            {tx(locale, 'Restore', 'Restore')}
          </CardTitle>
          <CardDescription>
            {tx(
              locale,
              'Verify integrity and preview a restore plan safely here. A full in-place restore recreates the very database and containers serving this page, so it is never a browser button - copy the tested steps and run them on the target host.',
              'Verifikasi integritas dan pratinjau rencana restore dengan aman di sini. Restore penuh in-place membuat ulang database dan container yang melayani halaman ini, jadi tidak pernah berupa tombol browser - salin langkah teruji dan jalankan pada host target.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <form action={verifyRepoAction}>
              <SubmitButton variant="secondary" size="sm" pendingText={tx(locale, 'Verifying...', 'Memverifikasi...')}>
                {tx(locale, 'Verify repository', 'Verifikasi repository')}
              </SubmitButton>
            </form>
            <form action={dryRunRestoreAction} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="snapshot" className="text-xs text-fg-subtle">
                  {tx(locale, 'Snapshot', 'Snapshot')}
                </Label>
                <Input id="snapshot" name="snapshot" defaultValue="latest" spellCheck={false} className="h-8 w-40" />
              </div>
              <SubmitButton variant="secondary" size="sm" pendingText={tx(locale, 'Planning...', 'Merencanakan...')}>
                {tx(locale, 'Dry-run restore', 'Dry-run restore')}
              </SubmitButton>
            </form>
          </div>

          {m.lastOpKind && m.lastOpOutput ? (
            <div>
              <p className="mb-1 text-xs font-medium text-fg-subtle">
                {tx(locale, 'Last operation', 'Operasi terakhir')}: {m.lastOpKind}
                {m.lastOpOk === false ? <span className="ml-1 text-danger">({tx(locale, 'failed', 'gagal')})</span> : null}
                {m.lastOpAt ? <span className="ml-1">{new Date(m.lastOpAt).toLocaleString()}</span> : null}
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                <code>{m.lastOpOutput}</code>
              </pre>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-surface-2/50 p-3">
            <p className="text-sm font-medium">{tx(locale, 'Full restore (run on the target host)', 'Restore penuh (jalankan pada host target)')}</p>
            <p className="mt-1 text-xs text-fg-subtle">
              {tx(
                locale,
                'The DB dump and the .env (ENCRYPTION_KEY) are a matched pair; restore.sh keeps them together. Fetch first (no changes), then add --apply to reconstruct.',
                'Dump DB dan .env (ENCRYPTION_KEY) adalah pasangan; restore.sh menjaganya bersama. Ambil dulu (tanpa perubahan), lalu tambahkan --apply untuk merekonstruksi.',
              )}
            </p>
            {cmd(
              `${s.scriptDir}/restore.sh --verify\n` +
                `${s.scriptDir}/restore.sh latest --dry-run\n` +
                `sudo ${s.scriptDir}/restore.sh latest --target /restore --apply\n` +
                `cd /opt/vacti && docker compose build && docker compose up -d`,
            )}
            <p className="mt-2 text-xs text-fg-subtle">
              {tx(locale, 'Full runbook:', 'Runbook lengkap:')} <code>ops/backup/README.md</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. Install / host setup runbook ------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Host setup', 'Setup host')}</CardTitle>
          <CardDescription>
            {tx(
              locale,
              'One-time on the host: install restic + scripts + timers, then fill the env (the Save form above writes it when the app can reach the host).',
              'Sekali pada host: install restic + skrip + timer, lalu isi env (form Simpan di atas menulisnya saat aplikasi dapat menjangkau host).',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cmd(`sudo /opt/vacti/ops/backup/install.sh`)}
          <p className="mt-2 text-xs text-fg-subtle">
            {tx(locale, 'Reference:', 'Referensi:')} <code>ops/backup/README.md</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
