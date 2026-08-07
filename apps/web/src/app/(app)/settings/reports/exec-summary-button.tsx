'use client';

import * as React from 'react';
import { Button } from '../../../../components/ui/button';
import { tx, type Locale } from '../../../../lib/i18n';

const errorText = (locale: Locale): Record<string, string> => ({
  no_ai_provider: tx(
    locale,
    'Set an AI provider + key first (Settings > Integrations).',
    'Set AI provider + key dulu (Settings > Integrations).',
  ),
  no_completed_scan: tx(
    locale,
    'No completed VA scan yet for this project - run a scan first.',
    'Belum ada VA scan yang selesai untuk project ini - jalankan scan dulu.',
  ),
  ai_failed: tx(locale, 'AI generation failed, try again.', 'Pembuatan AI gagal, coba lagi.'),
});

/**
 * Generate the AI executive summary via plain fetch and fill the VA branding form's textareas in
 * place (no reload): the AI call takes 10-30s and a server action's response gets dropped on this
 * page, which read as "nothing happened". The summary is already persisted server-side; syncing the
 * fields also prevents a later Save of the stale (empty) textareas from clobbering it.
 */
export function ExecSummaryButton({ projectId, locale = 'en' }: { projectId: string; locale?: Locale }) {
  const ERROR_TEXT = errorText(locale);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [failed, setFailed] = React.useState(false);

  const generate = async () => {
    setLoading(true);
    setMsg('');
    setFailed(false);
    try {
      const res = await fetch('/api/internal/exec-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = (await res.json()) as { ok?: boolean; en?: string; id?: string; error?: string };
      if (data.ok) {
        const en = document.getElementById('va-exec-en') as HTMLTextAreaElement | null;
        const idTa = document.getElementById('va-exec-id') as HTMLTextAreaElement | null;
        const show = document.getElementById('va-exec-show') as HTMLInputElement | null;
        if (en && typeof data.en === 'string') en.value = data.en;
        if (idTa && typeof data.id === 'string') idTa.value = data.id;
        if (show) show.checked = true;
        setMsg(
          tx(
            locale,
            'Generated and saved (from the latest completed VA scan). Review and edit above if needed.',
            'Dibuat dan disimpan (dari VA scan terakhir yang selesai). Tinjau dan ubah di atas jika perlu.',
          ),
        );
      } else {
        setFailed(true);
        setMsg(
          ERROR_TEXT[data.error ?? ''] ?? tx(locale, 'Generation failed, try again.', 'Pembuatan gagal, coba lagi.'),
        );
      }
    } catch {
      setFailed(true);
      setMsg(tx(locale, 'Request failed, try again.', 'Permintaan gagal, coba lagi.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <Button type="button" variant="outline" size="sm" loading={loading} onClick={generate}>
        {loading
          ? tx(locale, 'Generating (10-30s)...', 'Membuat (10-30 dtk)...')
          : tx(locale, 'Generate executive summary with AI', 'Buat ringkasan eksekutif dengan AI')}
      </Button>
      <p className={`mt-1 text-xs ${failed ? 'text-danger' : msg ? 'text-success' : 'text-fg-subtle'}`}>
        {msg ||
          tx(
            locale,
            'Uses the latest completed VA scan + the configured AI provider; fills both EN/ID.',
            'Memakai VA scan terakhir yang selesai + AI provider yang dikonfigurasi; mengisi EN/ID sekaligus.',
          )}
      </p>
    </div>
  );
}
