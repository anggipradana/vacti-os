import { redirect } from 'next/navigation';
import { PageHeader } from '../../../components/ui/page-header';
import { SettingsTabs } from '../../../components/settings-tabs';
import { getCurrentUser } from '../../../lib/session';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  return (
    <>
      <PageHeader
        title={tx(locale, 'Settings', 'Pengaturan')}
        description={tx(
          locale,
          'Projects, schedules, API tokens, scan profiles, reports, integrations, users, and audit.',
          'Project, jadwal, API token, scan profile, laporan, integrasi, pengguna, dan audit.',
        )}
      />
      <SettingsTabs isSysAdmin={user.isSysAdmin} locale={locale} />
      {children}
    </>
  );
}
