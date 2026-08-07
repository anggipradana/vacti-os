import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { SubmitButton } from '../../../../components/ui/submit-button';
import { Badge } from '../../../../components/ui/badge';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { roleFromUser } from '@vacti/core';
import { getCurrentUser } from '../../../../lib/session';
import { changeOwnPasswordAction, changeOwnEmailAction, signOutEverywhereAction } from '../../../../lib/actions';
import { getLocale } from '../../../../lib/locale';
import { tx, type Locale } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

const ERRORS = (locale: Locale): Record<string, string> => ({
  current: tx(locale, 'Current password is incorrect.', 'Password saat ini salah.'),
  weak: tx(locale, 'New password must be at least 8 characters.', 'Password baru minimal 8 karakter.'),
  mismatch: tx(locale, 'New password and confirmation do not match.', 'Password baru dan konfirmasi tidak cocok.'),
  email: tx(locale, 'Enter a valid email.', 'Masukkan email yang valid.'),
  emailtaken: tx(locale, 'That email is already in use.', 'Email itu sudah digunakan.'),
});

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const errs = ERRORS(locale);
  const sp = await searchParams;
  // Email card owns email errors/ok; password card owns the rest. Keep banners on the right card.
  const isEmailScope = sp.error === 'email' || sp.error === 'emailtaken' || sp.ok === 'email';
  const emailError =
    sp.error && isEmailScope
      ? (errs[sp.error] ?? tx(locale, 'Could not update email.', 'Tidak dapat memperbarui email.'))
      : null;
  const passwordError =
    sp.error && !isEmailScope
      ? (errs[sp.error] ?? tx(locale, 'Could not update password.', 'Tidak dapat memperbarui password.'))
      : null;
  const emailOk = sp.ok === 'email' ? tx(locale, 'Email updated.', 'Email diperbarui.') : null;
  // Password success historically lands as ?ok=1 (any non-email ok value).
  const passwordOk = sp.ok && sp.ok !== 'email' ? tx(locale, 'Password updated.', 'Password diperbarui.') : null;

  return (
    <div className="grid max-w-xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'My account', 'Akun saya')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-fg-muted">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-fg-muted">{tx(locale, 'Role', 'Peran')}</span>
            <Badge variant="neutral">{roleFromUser(user)}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Email', 'Email')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {emailOk ? (
            <p className="mb-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {emailOk}
            </p>
          ) : null}
          {emailError ? (
            <p className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {emailError}
            </p>
          ) : null}
          <form action={changeOwnEmailAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{tx(locale, 'Email address', 'Alamat email')}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" defaultValue={user.email} required />
            </div>
            <SubmitButton>{tx(locale, 'Save', 'Simpan')}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Change password', 'Ubah password')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {passwordOk ? (
            <p className="mb-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {passwordOk}
            </p>
          ) : null}
          {passwordError ? (
            <p className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {passwordError}
            </p>
          ) : null}
          <form action={changeOwnPasswordAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current">{tx(locale, 'Current password', 'Password saat ini')}</Label>
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next">{tx(locale, 'New password', 'Password baru')}</Label>
              <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{tx(locale, 'Confirm new password', 'Konfirmasi password baru')}</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <SubmitButton>{tx(locale, 'Update password', 'Perbarui password')}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Sessions', 'Sesi')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm text-fg-muted">
            {tx(
              locale,
              'Revoke every active session across all devices. You will be signed out here too.',
              'Cabut semua sesi aktif di seluruh perangkat. Anda juga akan keluar di sini.',
            )}
          </p>
          <form action={signOutEverywhereAction}>
            <ConfirmButton
              variant="destructive"
              confirm={tx(
                locale,
                'Sign out of all sessions, including this one?',
                'Keluar dari semua sesi, termasuk yang ini?',
              )}
            >
              {tx(locale, 'Sign out of all devices', 'Keluar dari semua perangkat')}
            </ConfirmButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
