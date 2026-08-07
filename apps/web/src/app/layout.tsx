import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '../components/theme-provider';
import { getActiveBranding } from '../lib/branding';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

// Title + favicon follow the active brand: the tab reads the workspace name, and a custom logo (data URI)
// becomes the favicon. Falls back to the bundled vacti icon when no custom logo is set.
export async function generateMetadata() {
  const branding = await getActiveBranding();
  return {
    title: branding.appName,
    description: 'Vulnerability Assessment + Cyber Threat Intelligence platform',
    icons: { icon: branding.logoDataUri || '/icon.svg' },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" toastOptions={{ className: 'font-sans' }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
