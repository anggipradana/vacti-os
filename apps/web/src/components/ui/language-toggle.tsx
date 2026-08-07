'use client';

import * as React from 'react';
import { Languages } from 'lucide-react';
import { cn } from '../../lib/cn';
import { LOCALE_COOKIE, type Locale } from '../../lib/i18n';

/**
 * Top-right language toggle (EN / ID). Sets the `locale` cookie, then does a FULL reload so every server
 * component (layout nav AND the page body) re-renders in the chosen language - router.refresh() did not
 * reliably re-render cached page bodies, so the menu changed but the content did not.
 */
export function LanguageToggle({ locale }: { locale: Locale }) {
  const [pending, setPending] = React.useState<Locale | null>(null);

  const switchTo = (l: Locale) => {
    if (l === locale) return;
    setPending(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  };

  return (
    <div
      className="flex items-center rounded-md border border-border text-xs"
      role="group"
      aria-label="Language"
      title="Language / Bahasa"
    >
      <Languages className="ml-1.5 size-3.5 text-fg-subtle" aria-hidden="true" />
      {(['en', 'id'] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={locale === l}
          className={cn(
            'px-1.5 py-1 font-medium uppercase transition-colors',
            locale === l ? 'text-accent' : 'text-fg-subtle hover:text-fg',
            pending === l ? 'opacity-60' : '',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
