'use client';

import * as React from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { revealCasePasswordAction, revealAllCasePasswordsAction } from '../../../../lib/leaks-actions';

/**
 * Shared "reveal all" state for a saved Case's password cells. `passwords` is null when reveal-all is off;
 * when on it holds resultId -> plaintext for every row that has a password (fetched once, audited once). A
 * single click on the top button flips every cell at once; the plaintext never ships up front.
 */
type RevealAllState = {
  passwords: Record<string, string> | null;
  loading: boolean;
  toggle: () => void;
};

const RevealAllContext = React.createContext<RevealAllState | null>(null);

export function RevealAllProvider({ searchId, children }: { searchId: string; children: React.ReactNode }) {
  const [passwords, setPasswords] = React.useState<Record<string, string> | null>(null);
  const [cache, setCache] = React.useState<Record<string, string> | null>(null);
  const [loading, setLoading] = React.useState(false);

  const toggle = React.useCallback(async () => {
    if (passwords) {
      setPasswords(null);
      return;
    }
    if (cache) {
      setPasswords(cache);
      return;
    }
    setLoading(true);
    try {
      const { passwords: p } = await revealAllCasePasswordsAction(searchId);
      setCache(p);
      setPasswords(p);
    } finally {
      setLoading(false);
    }
  }, [passwords, cache, searchId]);

  return <RevealAllContext.Provider value={{ passwords, loading, toggle }}>{children}</RevealAllContext.Provider>;
}

/** One-click reveal-all / hide-all button. Renders nothing outside a provider or when the Case has no passwords. */
export function RevealAllButton({ hasAnyPassword }: { hasAnyPassword: boolean }) {
  const ctx = React.useContext(RevealAllContext);
  if (!ctx || !hasAnyPassword) return null;
  const active = ctx.passwords !== null;
  return (
    <Button variant="outline" size="sm" onClick={ctx.toggle} disabled={ctx.loading}>
      {ctx.loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : active ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
      {active ? 'Hide all passwords' : 'Reveal all passwords'}
    </Button>
  );
}

/**
 * Masked leaked-password cell for a saved Case. The plaintext is NEVER shipped to the client up front: it
 * stays encrypted at rest and is decrypted only on an explicit action - either a per-row click (audited via
 * revealCasePasswordAction) or the case-wide "reveal all". When reveal-all is active this cell reflects the
 * shared plaintext and its per-row control is suspended; toggling reveal-all off masks it again.
 */
export function RevealPasswordCell({ resultId, hasPassword }: { resultId: string; hasPassword: boolean }) {
  const all = React.useContext(RevealAllContext);
  const [localShown, setLocalShown] = React.useState(false);
  const [value, setValue] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  if (!hasPassword) return <span className="text-fg-subtle">-</span>;

  const globalActive = all?.passwords != null;
  const globalValue = globalActive ? (all!.passwords![resultId] ?? null) : null;
  const shown = globalActive || localShown;
  const display = globalActive ? globalValue : value;

  async function toggle() {
    if (localShown) {
      setLocalShown(false);
      return;
    }
    if (value !== null) {
      setLocalShown(true);
      return;
    }
    setLoading(true);
    try {
      const { password } = await revealCasePasswordAction(resultId);
      setValue(password);
      setLocalShown(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading || globalActive}
      title={globalActive ? 'Revealed via "reveal all"' : shown ? 'Click to hide' : 'Click to reveal (audited)'}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-accent hover:underline disabled:opacity-90"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : shown ? (
        <EyeOff className="size-3.5" />
      ) : (
        <Eye className="size-3.5" />
      )}
      {shown ? (display ?? '(none)') : '••••••'}
    </button>
  );
}
