'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, LogOut, ChevronDown, Bell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ui/theme-toggle';
import { NavProgress } from '../ui/nav-progress';
import { LanguageToggle } from '../ui/language-toggle';
import { CommandPalette } from '../ui/command-palette';
import { makeT, type Locale } from '../../lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { logoutAction } from '../../lib/actions';

// Lean top nav: the operational surfaces (VA / Attack Surface / CTI) up front; Projects and
// Schedules live under Settings (workspace config, not day-to-day ops).
const nav = [
  { key: 'nav.dashboard', label: 'Dashboard', href: '/dashboard' },
  // Targets are demoted from the top nav: they only matter as scan inputs, so target management is
  // reachable from /scans (VA). The /targets routes stay intact and deep-linkable.
  { key: 'nav.va', label: 'Vulnerability Assessment', href: '/scans' },
  { key: 'nav.surface', label: 'Attack Surface', href: '/surface' },
  { key: 'nav.threat', label: 'Cyber Threat Intel', href: '/threat' },
  { key: 'nav.leaks', label: 'Leaks', href: '/leaks' },
  { key: 'nav.settings', label: 'Settings', href: '/settings/account' },
  { key: 'nav.docs', label: 'Docs', href: '/docs' },
];

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith('/settings')) return pathname.startsWith('/settings');
  return pathname === href || pathname.startsWith(href + '/');
}

export type Branding = { appName: string; logoDataUri: string | null };

/** Render the wordmark. The built-in "vacti" keeps its vac + accent-ti styling; any custom name renders
 *  whole, with the trailing 2 chars accented so a custom brand still gets the two-tone look. */
function Wordmark({ name }: { name: string }) {
  if (name.toLowerCase() === 'vacti') {
    return (
      <>
        vac<span className="text-accent">ti</span>
      </>
    );
  }
  if (name.length > 2) {
    return (
      <>
        {name.slice(0, -2)}
        <span className="text-accent">{name.slice(-2)}</span>
      </>
    );
  }
  return <>{name}</>;
}

function Brand({ branding }: { branding: Branding }) {
  return (
    <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
      <img
        src={branding.logoDataUri || '/logo.svg'}
        alt=""
        aria-hidden="true"
        width={28}
        height={31}
        className="h-7 w-auto"
      />
      <span className="font-display text-[17px] font-semibold tracking-tight">
        <Wordmark name={branding.appName} />
      </span>
    </Link>
  );
}

function UserMenu({ email, isSysAdmin }: { email: string; isSysAdmin: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" data-testid="user-menu">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{email}</span>
          <ChevronDown className="size-3.5 text-fg-subtle" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {email}
          {isSysAdmin ? ' · SysAdmin' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="logout"
          className="text-danger focus:bg-danger/10"
          onSelect={() => {
            void logoutAction();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  user,
  locale = 'en',
  helpAlert = null,
  branding = { appName: 'vacti', logoDataUri: null },
  children,
}: {
  user: { email: string; isSysAdmin: boolean };
  locale?: Locale;
  helpAlert?: { count: number; href: string } | null;
  branding?: Branding;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const tr = makeT(locale);

  return (
    <div className="min-h-screen">
      <NavProgress />
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-3 px-5 sm:px-6 lg:px-8">
          <Brand branding={branding} />
          {/* Full horizontal nav only at xl+: the descriptive labels (Vulnerability Assessment, Cyber
              Threat Intel) need the width. Below xl the hamburger drawer carries every item. */}
          <nav className="hidden h-14 items-center gap-0.5 xl:flex">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    'relative flex h-14 items-center whitespace-nowrap px-2 text-sm font-medium transition-colors',
                    active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {tr(item.key, item.label)}
                  {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" /> : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {helpAlert ? (
              <Link
                href={helpAlert.href}
                className="relative inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg"
                title={locale === 'id' ? 'Notifikasi' : 'Notifications'}
                aria-label="notifications"
              >
                <Bell className="size-5" />
                {helpAlert.count > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {helpAlert.count}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {/* The full search box needs room; show it at 2xl, keep the icon-trigger at xl so the
                nav fits comfortably between 1280-1536. ⌘K works at any width. */}
            <div className="hidden 2xl:block">
              <CommandPalette />
            </div>
            <div className="hidden xl:block 2xl:hidden">
              <CommandPalette iconOnly />
            </div>
            <LanguageToggle locale={locale} />
            <ThemeToggle />
            <UserMenu email={user.email} isSysAdmin={user.isSysAdmin} />
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>
        {mobileOpen ? (
          <nav className="border-t border-border px-3 py-2 md:hidden">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm font-medium',
                    active ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {tr(item.key, item.label)}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-screen-2xl px-5 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
