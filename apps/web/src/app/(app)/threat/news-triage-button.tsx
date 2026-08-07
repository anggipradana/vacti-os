'use client';

import * as React from 'react';
import { Button } from '../../../components/ui/button';
import { tx, type Locale } from '../../../lib/i18n';

/**
 * AI news-triage trigger via plain fetch: the AI call takes 10-30s, so a server action would be
 * reloaded through by the heavy /threat page before it returned (the result then looked like a
 * no-op). This awaits the result, then reloads once so the dismissed headlines drop out of view.
 */
export function NewsTriageButton({
  projectId,
  kind,
  locale = 'en',
}: {
  projectId: string;
  kind: 'sector' | 'brand';
  locale?: Locale;
}) {
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const ERR: Record<string, string> = {
    no_ai_provider: tx(locale, 'Set an AI provider + key first', 'Atur AI provider + key terlebih dulu'),
    no_candidates: tx(locale, 'Nothing new to triage', 'Tidak ada yang baru untuk ditriase'),
    ai_failed: tx(locale, 'AI failed, try again', 'AI gagal, coba lagi'),
  };

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/internal/news-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kind }),
      });
      const data = (await res.json()) as { ok?: boolean; dismissed?: number; error?: string };
      if (data.ok) {
        window.location.reload();
        return; // keep the spinner during reload
      }
      setMsg(ERR[data.error ?? ''] ?? tx(locale, 'Triage failed', 'Triase gagal'));
      setLoading(false);
    } catch {
      setMsg(tx(locale, 'Request failed', 'Permintaan gagal'));
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={loading}
        onClick={run}
        title={tx(
          locale,
          'Auto-mark off-topic headlines as Irrelevant (learns from your past triage)',
          'Tandai otomatis headline di luar topik sebagai Irrelevant (belajar dari triase Anda sebelumnya)',
        )}
      >
        {loading
          ? tx(locale, 'Analyzing…', 'Menganalisis…')
          : tx(locale, 'AI: filter irrelevant', 'AI: saring irrelevant')}
      </Button>
      {msg ? <span className="text-xs text-fg-subtle">{msg}</span> : null}
    </span>
  );
}
