'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { tx, type Locale } from '../../../lib/i18n';

/**
 * AI risk-analysis narrative with in-place (re)generation: clicking Generate runs the AI via a plain
 * fetch and swaps the text in place (spinner on the button), no full page reload.
 */
export function NarrativeCard({
  projectId,
  initial,
  canTriage,
  locale = 'en',
}: {
  projectId: string;
  initial: string | null;
  canTriage: boolean;
  locale?: Locale;
}) {
  const [narrative, setNarrative] = React.useState<string | null>(initial);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState('');

  const generate = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/internal/threat-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = (await res.json()) as { ok?: boolean; narrative?: string; error?: string };
      if (data.ok && typeof data.narrative === 'string') {
        setNarrative(data.narrative.replace(/[\u2014\u2013]/g, '-'));
      } else {
        setErr(
          data.error === 'no_ai_provider'
            ? tx(locale, 'Set an AI provider + key first', 'Atur AI provider + key terlebih dulu')
            : tx(locale, 'AI failed, try again', 'AI gagal, coba lagi'),
        );
      }
    } catch {
      setErr(tx(locale, 'Request failed', 'Permintaan gagal'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{tx(locale, 'AI risk analysis', 'Analisis risiko AI')}</CardTitle>
        {canTriage ? (
          <Button type="button" variant="outline" size="sm" loading={loading} onClick={generate}>
            {loading
              ? tx(locale, 'Generating...', 'Membuat...')
              : narrative
                ? tx(locale, 'Regenerate', 'Buat ulang')
                : tx(locale, 'Generate', 'Buat')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-relaxed text-fg-muted">
        {err ? <span className="text-danger">{err}</span> : null}
        {!err && narrative ? narrative : null}
        {!err && !narrative ? (
          <span className="text-fg-subtle">{tx(locale, 'Not generated yet.', 'Belum dibuat.')}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}
