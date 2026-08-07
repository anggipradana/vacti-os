import { redirect } from 'next/navigation';
import { AppShell } from '../../components/shell/app-shell';
import { getCurrentUser } from '../../lib/session';
import { getLocale } from '../../lib/locale';
import { getActiveBranding } from '../../lib/branding';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  // The bell always links to the notifications center (recent scan activity).
  const helpAlert = { count: 0, href: '/notifications' };
  const branding = await getActiveBranding();
  return (
    <AppShell
      user={{ email: user.email, isSysAdmin: user.isSysAdmin }}
      locale={locale}
      helpAlert={helpAlert}
      branding={branding}
    >
      {children}
    </AppShell>
  );
}
