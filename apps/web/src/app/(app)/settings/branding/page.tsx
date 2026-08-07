import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ConfirmButton } from '../../../../components/ui/confirm-button';
import { userCan, Permission } from '@vacti/core';
import { appBranding } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { getLocale } from '../../../../lib/locale';
import { tx } from '../../../../lib/i18n';
import {
  saveBrandingPresetAction,
  activateBrandingPresetAction,
  deleteBrandingPresetAction,
  revertBrandingAction,
} from '../../../../lib/branding-actions';

export const dynamic = 'force-dynamic';

/**
 * Branding control centre: edit the workspace name + logo, save named brand presets, switch between them, and
 * revert to the built-in default. The active preset drives the shell header, the login page, and the browser tab.
 */
export default async function BrandingPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!userCan(me, Permission.ModifySystemConfig)) redirect('/dashboard');
  const locale = await getLocale();
  const presets = await getDb()
    .select()
    .from(appBranding)
    .orderBy(desc(appBranding.isActive), desc(appBranding.createdAt));
  const active = presets.find((p) => p.isActive) ?? null;

  const logoSrc = (uri: string | null) => uri || '/logo.svg';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{tx(locale, 'Branding', 'Branding')}</h1>
        <p className="text-sm text-fg-subtle">
          {tx(
            locale,
            'Change the app name and logo shown in the header, login, and browser tab. Save brand presets, switch between them, and revert to the default anytime.',
            'Ubah nama app dan logo yang tampil di header, login, dan tab browser. Simpan preset brand, ganti-ganti, dan kembalikan ke default kapan saja.',
          )}
        </p>
      </div>

      {/* Active brand + revert */}
      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'Active brand', 'Brand aktif')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {' '}
            <img src={logoSrc(active?.logoDataUri ?? null)} alt="" width={28} height={31} className="h-7 w-auto" />
            <span className="font-display text-[17px] font-semibold tracking-tight">{active?.appName ?? 'vacti'}</span>
            {active?.isDefault ? <Badge variant="accent">{tx(locale, 'default', 'default')}</Badge> : null}
          </div>
          {active && !active.isDefault ? (
            <form action={revertBrandingAction}>
              <Button type="submit" variant="ghost">
                {tx(locale, 'Revert to default', 'Kembalikan ke default')}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Create a new brand */}
      <Card>
        <CardHeader>
          <CardTitle>{tx(locale, 'New brand', 'Brand baru')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveBrandingPresetAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-label">{tx(locale, 'Preset name', 'Nama preset')}</Label>
              <Input id="new-label" name="label" placeholder="e.g. Acme Corp" className="w-48" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-appName">{tx(locale, 'App name (wordmark)', 'Nama app (wordmark)')}</Label>
              <Input id="new-appName" name="appName" placeholder="e.g. acme" className="w-48" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-logo">{tx(locale, 'Logo (SVG/PNG, <=512KB)', 'Logo (SVG/PNG, <=512KB)')}</Label>
              <Input
                id="new-logo"
                name="logo"
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,image/*"
                className="w-56"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input type="checkbox" name="activate" defaultChecked /> {tx(locale, 'Apply now', 'Terapkan sekarang')}
            </label>
            <Button type="submit" variant="primary" className="mb-0.5">
              {tx(locale, 'Save brand', 'Simpan brand')}
            </Button>
          </form>
          <p className="mt-2 text-xs text-fg-subtle">
            {tx(
              locale,
              'Tip: the wordmark accents its last two characters (like vac-ti), so a name like "acme" renders ac-me.',
              'Tip: wordmark memberi aksen pada 2 huruf terakhir (seperti vac-ti), jadi nama "acme" tampil ac-me.',
            )}
          </p>
        </CardContent>
      </Card>

      {/* Saved brands */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tx(locale, 'Saved brands', 'Brand tersimpan')} ({presets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {presets.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                {' '}
                <img src={logoSrc(p.logoDataUri)} alt="" width={28} height={31} className="h-7 w-auto" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {p.isActive ? <Badge variant="success">{tx(locale, 'active', 'aktif')}</Badge> : null}
                    {p.isDefault ? <Badge variant="accent">{tx(locale, 'default', 'default')}</Badge> : null}
                  </div>
                  <div className="font-display text-sm text-fg-subtle">{p.appName}</div>
                </div>
                <div className="flex gap-1.5">
                  {!p.isActive ? (
                    <form action={activateBrandingPresetAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" size="sm" variant="primary">
                        {tx(locale, 'Apply', 'Terapkan')}
                      </Button>
                    </form>
                  ) : null}
                  {!p.isDefault ? (
                    <form action={deleteBrandingPresetAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        confirm={tx(locale, 'Delete this brand preset?', 'Hapus preset brand ini?')}
                      >
                        {tx(locale, 'Delete', 'Hapus')}
                      </ConfirmButton>
                    </form>
                  ) : null}
                </div>
              </div>
              {/* Inline edit (name + logo) - the default is editable too but keeps its revert role */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent">{tx(locale, 'Edit', 'Edit')}</summary>
                <form action={saveBrandingPresetAction} className="mt-2 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor={`label-${p.id}`}>{tx(locale, 'Preset name', 'Nama preset')}</Label>
                    <Input id={`label-${p.id}`} name="label" defaultValue={p.label} className="w-44" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`appName-${p.id}`}>{tx(locale, 'App name', 'Nama app')}</Label>
                    <Input id={`appName-${p.id}`} name="appName" defaultValue={p.appName} className="w-44" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`logo-${p.id}`}>
                      {tx(locale, 'Replace logo (optional)', 'Ganti logo (opsional)')}
                    </Label>
                    <Input id={`logo-${p.id}`} name="logo" type="file" accept="image/*" className="w-52" />
                  </div>
                  <label className="flex items-center gap-1.5 pb-2 text-sm">
                    <input type="checkbox" name="activate" defaultChecked={p.isActive} />{' '}
                    {tx(locale, 'Apply', 'Terapkan')}
                  </label>
                  <Button type="submit" size="sm" variant="secondary" className="mb-0.5">
                    {tx(locale, 'Save', 'Simpan')}
                  </Button>
                </form>
              </details>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
