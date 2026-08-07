'use client';
import * as React from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  KeyRound,
  FolderKanban,
  CalendarClock,
  Network,
  ShieldAlert,
  Fingerprint,
  Search,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';

const items = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Vulnerability Assessment', href: '/scans', icon: Radar },
  { label: 'Attack Surface', href: '/surface', icon: Network },
  { label: 'Cyber Threat Intel', href: '/threat', icon: ShieldAlert },
  { label: 'Leaks', href: '/leaks', icon: Fingerprint },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Projects', href: '/settings/projects', icon: FolderKanban },
  { label: 'Schedules', href: '/settings/schedules', icon: CalendarClock },
  { label: 'API Tokens', href: '/settings/tokens', icon: KeyRound },
];

export function CommandPalette({ iconOnly = false }: { iconOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {iconOnly ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Search (Ctrl/Cmd K)"
          className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Search className="size-4" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-9 w-full max-w-72 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-fg-subtle transition-colors hover:border-border-strong"
        >
          <Search className="size-4" />
          <span>Search…</span>
          <kbd className="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-fg-muted">
            ⌘K
          </kbd>
        </button>
      )}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-xl data-[state=open]:animate-fade-in">
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <Command className="[&_[cmdk-input]]:h-12">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-fg-subtle" />
                <Command.Input
                  placeholder="Go to…"
                  className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
                />
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">No results.</Command.Empty>
                <Command.Group
                  heading="Navigate"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle"
                >
                  {items.map((it) => (
                    <Command.Item
                      key={it.href}
                      onSelect={() => {
                        setOpen(false);
                        router.push(it.href);
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm outline-none data-[selected=true]:bg-surface-2',
                      )}
                    >
                      <it.icon className="size-4 text-fg-subtle" />
                      {it.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
