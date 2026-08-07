import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { FormBanner } from '../../../../components/ui/form-banner';
import { Select } from '../../../../components/ui/select';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Badge } from '../../../../components/ui/badge';
import { Role, ROLE_LABEL, roleFromUser, userCan, Permission } from '@vacti/core';
import { users } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import {
  changeUserRoleAction,
  addUserAction,
  deleteUserAction,
  resetUserPasswordAction,
} from '../../../../lib/actions';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  // SysAdmin-only page (requires modify_system_config).
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const rows = await getDb().select().from(users).orderBy(desc(users.createdAt));
  const sp = await searchParams;

  return (
    <>
      <FormBanner
        ok={sp.ok}
        error={sp.error}
        messages={{
          invalid: tx(
            locale,
            'Enter a valid email and a password of at least 8 characters.',
            'Masukkan email yang valid dan password minimal 8 karakter.',
          ),
          exists: tx(locale, 'A user with that email already exists.', 'Pengguna dengan email itu sudah ada.'),
          weak: tx(locale, 'Password must be at least 8 characters.', 'Password minimal 8 karakter.'),
        }}
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{tx(locale, 'Add user', 'Tambah pengguna')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={addUserAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">{tx(locale, 'Email', 'Email')}</Label>
              <Input id="email" name="email" type="email" placeholder="analyst@org.com" required className="w-56" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{tx(locale, 'Password', 'Password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={tx(locale, 'min 8 chars', 'min 8 karakter')}
                required
                className="w-48"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newrole">{tx(locale, 'Role', 'Peran')}</Label>
              <Select id="newrole" name="role" defaultValue={Role.PenetrationTester} className="w-48">
                <option value={Role.SysAdmin}>{ROLE_LABEL[Role.SysAdmin]}</option>
                <option value={Role.PenetrationTester}>{ROLE_LABEL[Role.PenetrationTester]}</option>
                <option value={Role.Auditor}>{ROLE_LABEL[Role.Auditor]}</option>
              </Select>
            </div>
            <SubmitButton>{tx(locale, 'Add user', 'Tambah pengguna')}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Users & roles', 'Pengguna & peran')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {rows.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
              <div>
                <span className="font-medium">{u.email}</span>
                {u.id === me.id ? (
                  <Badge variant="accent" className="ml-2">
                    {tx(locale, 'you', 'Anda')}
                  </Badge>
                ) : null}
                <div className="text-xs text-fg-subtle">{ROLE_LABEL[roleFromUser(u)]}</div>
              </div>
              <div className="flex items-center gap-2">
                <form action={changeUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="role" defaultValue={roleFromUser(u)} className="w-48">
                    <option value={Role.SysAdmin}>{ROLE_LABEL[Role.SysAdmin]}</option>
                    <option value={Role.PenetrationTester}>{ROLE_LABEL[Role.PenetrationTester]}</option>
                    <option value={Role.Auditor}>{ROLE_LABEL[Role.Auditor]}</option>
                  </Select>
                  <SubmitButton size="sm" variant="outline">
                    {tx(locale, 'Save', 'Simpan')}
                  </SubmitButton>
                </form>
                <form action={resetUserPasswordAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Input
                    name="password"
                    type="password"
                    placeholder={tx(locale, 'New password', 'Password baru')}
                    required
                    minLength={8}
                    className="w-44"
                  />
                  <SubmitButton size="sm" variant="outline">
                    {tx(locale, 'Reset password', 'Reset password')}
                  </SubmitButton>
                </form>
                {u.id !== me.id ? (
                  <form action={deleteUserAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10"
                      confirm={tx(
                        locale,
                        `Delete user ${u.email}? This cannot be undone.`,
                        `Hapus pengguna ${u.email}? Tindakan ini tidak dapat dibatalkan.`,
                      )}
                    >
                      {tx(locale, 'Delete', 'Hapus')}
                    </ConfirmButton>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-fg-subtle">
        {tx(
          locale,
          'Auditor = read-only + reports. Penetration Tester = scans, results, targets, reports (no system config). System Admin = everything, incl. integrations & user roles.',
          'Auditor = baca-saja + laporan. Penetration Tester = scan, hasil, target, laporan (tanpa system config). System Admin = semuanya, termasuk integrasi & peran pengguna.',
        )}
      </p>
    </>
  );
}
