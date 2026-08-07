import { redirect } from 'next/navigation';
import { asc, desc, sql } from 'drizzle-orm';
import { KeyRound, Package, Users, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { FormBanner } from '../../../../components/ui/form-banner';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { Badge } from '../../../../components/ui/badge';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Table, THead, TBody, TR, TH, TD } from '../../../../components/ui/table';
import { userCan, Permission, roleFromUser, ROLE_LABEL, Role } from '@vacti/core';
import { leakProviders, leakPackages, leakUserAccess, leakUsage, users } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';
import {
  setLeakProviderKeyAction,
  toggleLeakProviderAction,
  testLeakProviderAction,
  createLeakPackageAction,
  updateLeakPackageAction,
  deleteLeakPackageAction,
  setDefaultLeakPackageAction,
  assignUserLeakAccessAction,
  resetUserLeakUsageAction,
} from '../../../../lib/leaks-admin-actions';

export const dynamic = 'force-dynamic';

// The ONLY place the real provider names appear in the product. Everywhere else the tool is white-labeled.
const PROVIDER_META: { id: 'leakcheck'; label: string; envVar: string }[] = [
  { id: 'leakcheck', label: 'LeakCheck', envVar: 'LEAKCHECK_API_KEY' },
];

export default async function LeaksAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  // SysAdmin only (modify_system_config): provider keys + quota packages + user access are system config.
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const sp = await searchParams;
  const db = getDb();

  const [providerRows, packages, userRows, accessRows, usageRows] = await Promise.all([
    db.select().from(leakProviders),
    db.select().from(leakPackages).orderBy(asc(leakPackages.name)),
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select().from(leakUserAccess),
    // Batched: today's usage for ALL users in one query (no N+1).
    db
      .select({ userId: leakUsage.userId, count: leakUsage.count })
      .from(leakUsage)
      .where(sql`${leakUsage.day} = current_date`),
  ]);

  const accessByUser = new Map(accessRows.map((a) => [a.userId, a]));
  const usageByUser = new Map(usageRows.map((u) => [u.userId, u.count]));
  const defaultPkg = packages.find((p) => p.isDefault);
  const lim = (n: number | null | undefined) => (n == null ? tx(locale, 'unlimited', 'tak terbatas') : String(n));

  return (
    <div className="max-w-4xl space-y-6">
      <FormBanner
        ok={sp.ok}
        error={sp.error}
        messages={{
          key_set: tx(locale, 'Provider key saved.', 'Kunci provider disimpan.'),
          key_cleared: tx(locale, 'Provider key cleared (using env fallback).', 'Kunci provider dihapus (pakai env).'),
          provider_enabled: tx(locale, 'Provider enabled.', 'Provider diaktifkan.'),
          provider_disabled: tx(locale, 'Provider disabled.', 'Provider dinonaktifkan.'),
          test_leakcheck_ok: tx(locale, 'LeakCheck responded successfully.', 'LeakCheck merespons sukses.'),
          test_leakcheck_fail: tx(locale, 'LeakCheck test failed (check the key).', 'Tes LeakCheck gagal (cek kunci).'),
          test_leakcheck_nokey: tx(locale, 'No LeakCheck key set or in env.', 'Tidak ada kunci LeakCheck.'),
          pkg_created: tx(locale, 'Package created.', 'Paket dibuat.'),
          pkg_updated: tx(locale, 'Package updated.', 'Paket diperbarui.'),
          pkg_deleted: tx(locale, 'Package deleted.', 'Paket dihapus.'),
          pkg_default: tx(locale, 'Default package set.', 'Paket default diatur.'),
          pkg_exists: tx(locale, 'A package with that name already exists.', 'Paket dengan nama itu sudah ada.'),
          pkg_name: tx(locale, 'A package name is required.', 'Nama paket wajib diisi.'),
          pkg_last: tx(locale, 'Cannot delete the last package.', 'Tidak bisa menghapus paket terakhir.'),
          pkg_default_del: tx(locale, 'Set another default first.', 'Atur default lain dulu.'),
          pkg_default_guard: tx(
            locale,
            'This is the default package. Set another default before deleting it.',
            'Ini paket default. Atur default lain sebelum menghapus.',
          ),
          access_assigned: tx(locale, 'User access saved.', 'Akses pengguna disimpan.'),
          usage_reset: tx(locale, "Today's usage reset.", 'Pemakaian hari ini direset.'),
        }}
        fallback={
          sp.error === 'pkg_default'
            ? tx(
                locale,
                'This is the default package. Set another default before deleting it.',
                'Ini paket default. Atur default lain sebelum menghapus.',
              )
            : undefined
        }
      />

      {/* PROVIDERS - the only place real provider names appear. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> {tx(locale, 'Leak providers', 'Provider kebocoran')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <p className="text-sm text-fg-muted">
            {tx(
              locale,
              'Provider names appear only on this admin page. A stored key overrides the environment fallback; clearing it falls back to the env variable.',
              'Nama provider hanya muncul di halaman admin ini. Kunci tersimpan menimpa fallback environment; mengosongkannya kembali ke variabel env.',
            )}
          </p>
          {PROVIDER_META.map((p) => {
            const row = providerRows.find((r) => r.provider === p.id);
            const enabled = row ? row.enabled : true;
            const hasStoredKey = Boolean(row?.keyCiphertext);
            const hasEnvKey = Boolean(process.env[p.envVar]);
            return (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {hasStoredKey ? (
                      <Badge variant="accent">{tx(locale, 'stored key', 'kunci tersimpan')}</Badge>
                    ) : hasEnvKey ? (
                      <Badge variant="outline">{tx(locale, 'env fallback', 'fallback env')}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-danger">
                        {tx(locale, 'no key', 'tanpa kunci')}
                      </Badge>
                    )}
                    <Badge variant={enabled ? 'success' : 'outline'}>
                      {enabled ? tx(locale, 'enabled', 'aktif') : tx(locale, 'disabled', 'nonaktif')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={toggleLeakProviderAction}>
                      <input type="hidden" name="provider" value={p.id} />
                      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
                      <SubmitButton size="sm" variant="outline">
                        {enabled ? tx(locale, 'Disable', 'Nonaktifkan') : tx(locale, 'Enable', 'Aktifkan')}
                      </SubmitButton>
                    </form>
                    <form action={testLeakProviderAction}>
                      <input type="hidden" name="provider" value={p.id} />
                      <SubmitButton size="sm" variant="outline" pendingText={tx(locale, 'Testing...', 'Menguji...')}>
                        {tx(locale, 'Test', 'Uji')}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <form action={setLeakProviderKeyAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="provider" value={p.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor={`key-${p.id}`}>{tx(locale, 'API key', 'API key')}</Label>
                    <Input
                      id={`key-${p.id}`}
                      name="key"
                      type="password"
                      autoComplete="off"
                      placeholder={
                        hasStoredKey
                          ? tx(locale, 'stored - type to replace, blank to clear', 'tersimpan - isi untuk ganti')
                          : tx(locale, 'paste key (blank = use env)', 'tempel kunci (kosong = pakai env)')
                      }
                      className="w-80"
                    />
                  </div>
                  <SubmitButton size="sm">{tx(locale, 'Save key', 'Simpan kunci')}</SubmitButton>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* PACKAGES */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4" /> {tx(locale, 'Quota packages', 'Paket kuota')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <p className="text-sm text-fg-muted">
            {tx(
              locale,
              'Blank limit = unlimited. New users without an explicit assignment get the default package.',
              'Batas kosong = tak terbatas. Pengguna baru tanpa penetapan mendapat paket default.',
            )}
          </p>
          {packages.length === 0 ? (
            <p className="text-sm text-fg-subtle">{tx(locale, 'No packages yet.', 'Belum ada paket.')}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{tx(locale, 'Name', 'Nama')}</TH>
                  <TH>{tx(locale, 'Daily', 'Harian')}</TH>
                  <TH>{tx(locale, 'Monthly', 'Bulanan')}</TH>
                  <TH className="text-right">{tx(locale, 'Actions', 'Aksi')}</TH>
                </TR>
              </THead>
              <TBody>
                {packages.map((pkg) => (
                  <TR key={pkg.id}>
                    <TD colSpan={4} className="p-0">
                      <form action={updateLeakPackageAction} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <input type="hidden" name="id" value={pkg.id} />
                        <Input name="name" defaultValue={pkg.name} className="w-44" />
                        {pkg.isDefault ? <Badge variant="accent">{tx(locale, 'default', 'default')}</Badge> : null}
                        <Input
                          name="dailyLimit"
                          type="number"
                          min={1}
                          defaultValue={pkg.dailyLimit ?? ''}
                          placeholder={tx(locale, 'unlimited', 'tak terbatas')}
                          className="w-28"
                        />
                        <Input
                          name="monthlyLimit"
                          type="number"
                          min={1}
                          defaultValue={pkg.monthlyLimit ?? ''}
                          placeholder={tx(locale, 'unlimited', 'tak terbatas')}
                          className="w-28"
                        />
                        <SubmitButton size="sm" variant="outline">
                          {tx(locale, 'Save', 'Simpan')}
                        </SubmitButton>
                        {!pkg.isDefault ? (
                          <SubmitButton size="sm" variant="ghost" formAction={setDefaultLeakPackageAction}>
                            {tx(locale, 'Set default', 'Jadikan default')}
                          </SubmitButton>
                        ) : null}
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-danger/10"
                          formAction={deleteLeakPackageAction}
                          confirm={tx(locale, `Delete package ${pkg.name}?`, `Hapus paket ${pkg.name}?`)}
                        >
                          {tx(locale, 'Delete', 'Hapus')}
                        </ConfirmButton>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <form action={createLeakPackageAction} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pkg-name">{tx(locale, 'New package', 'Paket baru')}</Label>
              <Input
                id="new-pkg-name"
                name="name"
                placeholder={tx(locale, 'e.g. Standard', 'mis. Standar')}
                required
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pkg-daily">{tx(locale, 'Daily', 'Harian')}</Label>
              <Input
                id="new-pkg-daily"
                name="dailyLimit"
                type="number"
                min={1}
                placeholder={tx(locale, 'unlimited', 'tak terbatas')}
                className="w-28"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pkg-monthly">{tx(locale, 'Monthly', 'Bulanan')}</Label>
              <Input
                id="new-pkg-monthly"
                name="monthlyLimit"
                type="number"
                min={1}
                placeholder={tx(locale, 'unlimited', 'tak terbatas')}
                className="w-28"
              />
            </div>
            <SubmitButton size="sm">{tx(locale, 'Add package', 'Tambah paket')}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* USER ASSIGNMENTS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> {tx(locale, 'User access', 'Akses pengguna')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="text-sm text-fg-muted">
            {tx(
              locale,
              'Assign a package and optional per-user overrides. System Admins bypass quota entirely.',
              'Tetapkan paket dan override opsional per pengguna. System Admin bebas kuota.',
            )}
          </p>
          {userRows.map((u) => {
            const role = roleFromUser(u);
            const used = usageByUser.get(u.id) ?? 0;
            if (role === Role.SysAdmin) {
              return (
                <div key={u.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                  <div>
                    <span className="font-medium">{u.email}</span>
                    <div className="text-xs text-fg-subtle">{ROLE_LABEL[role]}</div>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ShieldCheck className="size-3" /> {tx(locale, 'Unlimited (admin)', 'Tak terbatas (admin)')}
                  </Badge>
                </div>
              );
            }
            const access = accessByUser.get(u.id);
            return (
              <div key={u.id} className="border-b border-border py-3 last:border-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{u.email}</span>
                    <div className="text-xs text-fg-subtle">
                      {ROLE_LABEL[role]} {' - '}
                      {tx(locale, 'used', 'terpakai')} {used} {tx(locale, 'today', 'hari ini')}
                    </div>
                  </div>
                  <form action={resetUserLeakUsageAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <SubmitButton size="sm" variant="ghost" disabled={used === 0}>
                      {tx(locale, 'Reset usage', 'Reset pemakaian')}
                    </SubmitButton>
                  </form>
                </div>
                <form action={assignUserLeakAccessAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor={`pkg-${u.id}`}>{tx(locale, 'Package', 'Paket')}</Label>
                    <Select id={`pkg-${u.id}`} name="packageId" defaultValue={access?.packageId ?? ''} className="w-48">
                      <option value="">
                        {tx(locale, 'Default', 'Default')}
                        {defaultPkg ? ` (${defaultPkg.name})` : ''}
                      </option>
                      {packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name} ({lim(pkg.dailyLimit)}/{tx(locale, 'day', 'hari')})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`daily-${u.id}`}>{tx(locale, 'Daily override', 'Override harian')}</Label>
                    <Input
                      id={`daily-${u.id}`}
                      name="dailyLimitOverride"
                      type="number"
                      min={1}
                      defaultValue={access?.dailyLimitOverride ?? ''}
                      placeholder={tx(locale, 'package', 'paket')}
                      className="w-28"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`monthly-${u.id}`}>{tx(locale, 'Monthly override', 'Override bulanan')}</Label>
                    <Input
                      id={`monthly-${u.id}`}
                      name="monthlyLimitOverride"
                      type="number"
                      min={1}
                      defaultValue={access?.monthlyLimitOverride ?? ''}
                      placeholder={tx(locale, 'package', 'paket')}
                      className="w-28"
                    />
                  </div>
                  <SubmitButton size="sm" variant="outline">
                    {tx(locale, 'Save', 'Simpan')}
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
