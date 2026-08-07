'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { NEWS_STATUS_LABEL } from '@vacti/core';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select } from '../../../components/ui/select';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { Badge } from '../../../components/ui/badge';
import { NewsStatusBadge } from '../../../components/ui/finding-status';
import { AutoSubmitSelect } from '../../../components/ui/auto-submit-select';
import { setBrandNewsStatusAction, bulkSetBrandNewsStatusByIdsAction } from '../../../lib/threat-actions';
import { tx, type Locale } from '../../../lib/i18n';

export interface BrandNewsItem {
  id: string;
  title: string;
  link: string;
  source: string | null;
  publishedAt: string | null;
  security: boolean;
  status: string;
  aiSentiment: string | null;
  aiRelevance: string | null;
  aiSentimentReason: string | null;
  sentimentFeedback: string | null;
}

interface Verdict {
  sentiment: string | null;
  relevance: string | null;
  reason: string | null;
  feedback: string | null;
}

const SENTIMENT_BADGE: Record<string, 'danger' | 'success' | 'neutral'> = {
  negative: 'danger',
  positive: 'success',
  neutral: 'neutral',
};

/**
 * Per-headline AI sentiment toward the brand - presentational. State lives in the parent so a single
 * "Analyze all" action and the per-row buttons share it (both update in place, no page reload).
 */
function BrandSentiment({
  verdict,
  loading,
  err,
  canTriage,
  onGenerate,
  onMark,
  locale,
}: {
  verdict: Verdict;
  loading: boolean;
  err: string;
  canTriage: boolean;
  onGenerate: () => void;
  onMark: (value: 'correct' | 'incorrect') => void;
  locale: Locale;
}) {
  const { sentiment, relevance, reason, feedback } = verdict;

  if (!sentiment) {
    if (!canTriage) return null;
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs text-accent"
          loading={loading}
          onClick={onGenerate}
        >
          {loading ? null : <Sparkles className="size-3.5" />}
          {loading
            ? tx(locale, 'Analyzing sentiment…', 'Menganalisis sentiment…')
            : tx(locale, 'AI sentiment', 'AI sentiment')}
        </Button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Badge variant={SENTIMENT_BADGE[sentiment] ?? 'neutral'} title={reason ?? undefined}>
        {sentiment}
      </Badge>
      {relevance ? (
        <Badge
          variant={relevance === 'irrelevant' ? 'neutral' : 'accent'}
          title={tx(
            locale,
            'Is this headline actually about the brand?',
            'Apakah headline ini benar tentang brand ini?',
          )}
        >
          {relevance}
        </Badge>
      ) : null}
      {reason ? <span className="max-w-[26rem] truncate text-xs text-fg-subtle">{reason}</span> : null}
      {canTriage ? (
        <span className="flex items-center gap-1 text-xs text-fg-subtle">
          <span>{tx(locale, 'Correct?', 'Benar?')}</span>
          <button
            type="button"
            onClick={() => onMark('correct')}
            aria-label="AI sentiment is correct"
            className={`rounded px-1.5 py-0.5 ${feedback === 'correct' ? 'bg-success/20 text-success' : 'hover:bg-surface-2'}`}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => onMark('incorrect')}
            aria-label="AI sentiment is wrong"
            className={`rounded px-1.5 py-0.5 ${feedback === 'incorrect' ? 'bg-danger/20 text-danger' : 'hover:bg-surface-2'}`}
          >
            ✗
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="ml-1 hover:text-fg-muted"
            aria-label="Regenerate sentiment"
          >
            {loading ? '…' : '↻'}
          </button>
        </span>
      ) : null}
    </div>
  );
}

const STATUS_OPTIONS = Object.entries(NEWS_STATUS_LABEL);

/**
 * Brand monitoring headline list: text search, client status filter, checkbox multi-select for bulk
 * status, per-row instant status change, and AI sentiment (per-row + an "analyze all" bulk button).
 */
export function BrandNewsList({
  items,
  canTriage,
  locale = 'en',
}: {
  items: BrandNewsItem[];
  canTriage: boolean;
  locale?: Locale;
}) {
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // AI sentiment state lifted here so the per-row buttons and the "analyze all" bulk action share it.
  const [verdicts, setVerdicts] = React.useState<Record<string, Verdict>>(() => {
    const m: Record<string, Verdict> = {};
    for (const it of items)
      m[it.id] = {
        sentiment: it.aiSentiment,
        relevance: it.aiRelevance,
        reason: it.aiSentimentReason,
        feedback: it.sentimentFeedback,
      };
    return m;
  });
  const [loadingIds, setLoadingIds] = React.useState<Set<string>>(new Set());
  const [errIds, setErrIds] = React.useState<Record<string, string>>({});
  const [bulk, setBulk] = React.useState<{ running: boolean; done: number; total: number }>({
    running: false,
    done: 0,
    total: 0,
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (!q) return true;
      return `${n.title} ${n.source ?? ''}`.toLowerCase().includes(q);
    });
  }, [items, query, statusFilter]);

  const setLoading = (id: string, on: boolean) =>
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const generateOne = async (id: string): Promise<boolean> => {
    setLoading(id, true);
    setErrIds((p) => ({ ...p, [id]: '' }));
    try {
      const res = await fetch('/api/internal/brand-sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sentiment?: string;
        relevance?: string;
        reason?: string;
        error?: string;
      };
      if (data.ok && data.sentiment) {
        setVerdicts((p) => ({
          ...p,
          [id]: {
            sentiment: data.sentiment!,
            relevance: data.relevance ?? null,
            reason: data.reason ?? null,
            feedback: null,
          },
        }));
        return true;
      }
      setErrIds((p) => ({
        ...p,
        [id]:
          data.error === 'no_ai_provider'
            ? tx(locale, 'Set an AI provider first', 'Atur AI provider terlebih dulu')
            : tx(locale, 'AI failed', 'AI gagal'),
      }));
      return false;
    } catch {
      setErrIds((p) => ({ ...p, [id]: tx(locale, 'Request failed', 'Permintaan gagal') }));
      return false;
    } finally {
      setLoading(id, false);
    }
  };

  const markOne = async (id: string, value: 'correct' | 'incorrect') => {
    const cur = verdicts[id]?.feedback;
    const next = cur === value ? null : value;
    setVerdicts((p) => ({ ...p, [id]: { ...p[id]!, feedback: next } }));
    try {
      await fetch('/api/internal/brand-sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, feedback: next ?? 'clear' }),
      });
    } catch {
      /* best-effort; local state already reflects the click */
    }
  };

  // Analyze sentiment for every shown headline that doesn't have one yet (sequential, one provider
  // call each, with progress). Re-running won't re-bill already-analyzed rows.
  const generateAll = async () => {
    if (bulk.running) return;
    const targets = filtered.filter((n) => !verdicts[n.id]?.sentiment).map((n) => n.id);
    if (!targets.length) return;
    setBulk({ running: true, done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      await generateOne(targets[i]!).catch(() => {});
      setBulk((b) => ({ ...b, done: i + 1 }));
    }
    setBulk((b) => ({ ...b, running: false }));
  };

  const pendingCount = filtered.filter((n) => !verdicts[n.id]?.sentiment).length;

  // Headlines the AI judged not about this brand and not already dismissed - one-click bulk dismiss.
  const aiIrrelevantIds = filtered
    .filter((n) => verdicts[n.id]?.relevance === 'irrelevant' && n.status !== 'dismissed')
    .map((n) => n.id);

  // Live AI accuracy from the analyst's correct/incorrect marks (updates as you click ✓/✗).
  const rated = Object.values(verdicts).filter((v) => v.feedback === 'correct' || v.feedback === 'incorrect');
  const correctCount = rated.filter((v) => v.feedback === 'correct').length;
  const accuracy = rated.length ? Math.round((correctCount / rated.length) * 100) : null;

  const filteredIds = filtered.map((n) => n.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const selectedIds = [...selected];

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canTriage ? (
          <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Checkbox
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              aria-label="Select all shown headlines"
            />
            {tx(locale, 'Select all', 'Pilih semua')}
          </label>
        ) : null}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tx(locale, 'Search headlines (title, source)…', 'Cari headline (judul, source)…')}
          className="h-8 w-64 text-xs"
          aria-label="Search brand news"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 w-36 text-xs"
          aria-label="Filter brand news by status"
        >
          <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
          {STATUS_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-subtle">
          {filtered.length} {tx(locale, 'of', 'dari')} {items.length}
        </span>
        {accuracy !== null ? (
          <Badge
            variant={accuracy >= 80 ? 'success' : accuracy >= 50 ? 'accent' : 'danger'}
            title={tx(
              locale,
              `${correctCount} of ${rated.length} AI verdicts marked correct`,
              `${correctCount} dari ${rated.length} verdict AI ditandai benar`,
            )}
          >
            {tx(locale, 'AI accuracy', 'Akurasi AI')} {accuracy}% ({rated.length})
          </Badge>
        ) : null}
        {canTriage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-8 gap-1 text-xs text-accent"
            loading={bulk.running}
            disabled={pendingCount === 0}
            onClick={generateAll}
            title={tx(
              locale,
              "Run AI sentiment for every shown headline that doesn't have one yet",
              'Jalankan AI sentiment untuk setiap headline yang belum punya',
            )}
          >
            {bulk.running ? null : <Sparkles className="size-3.5" />}
            {bulk.running
              ? `${tx(locale, 'Analyzing', 'Menganalisis')} ${bulk.done}/${bulk.total}…`
              : `${tx(locale, 'AI sentiment: all', 'AI sentiment: semua')} (${pendingCount})`}
          </Button>
        ) : null}
      </div>

      {/* One-click: dismiss every headline the AI judged not about this brand. */}
      {canTriage && aiIrrelevantIds.length > 0 ? (
        <ActionForm
          action={bulkSetBrandNewsStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2/50 px-3 py-2"
        >
          {aiIrrelevantIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <input type="hidden" name="status" value="dismissed" />
          <span className="text-xs text-fg-muted">
            {tx(
              locale,
              `AI flagged ${aiIrrelevantIds.length} headline(s) as not about this brand.`,
              `AI menandai ${aiIrrelevantIds.length} headline sebagai bukan tentang brand ini.`,
            )}
          </span>
          <ActionSubmit size="sm" variant="outline" className="text-xs">
            {tx(locale, 'Dismiss AI-irrelevant', 'Singkirkan AI-irrelevant')} ({aiIrrelevantIds.length})
          </ActionSubmit>
        </ActionForm>
      ) : null}

      {/* Bulk action bar - appears when rows are selected. */}
      {canTriage && selected.size > 0 ? (
        <ActionForm
          action={bulkSetBrandNewsStatusByIdsAction}
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2"
        >
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selected.size} {tx(locale, 'selected', 'dipilih')}
          </span>
          <Select name="status" defaultValue="reviewed" className="h-8 w-36 text-xs" aria-label="Bulk set status">
            {STATUS_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {tx(locale, 'Set', 'Atur')}: {label}
              </option>
            ))}
          </Select>
          <ActionSubmit size="sm" variant="primary">
            {tx(locale, 'Apply to selected', 'Terapkan ke yang dipilih')}
          </ActionSubmit>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {tx(locale, 'Clear', 'Bersihkan')}
          </Button>
        </ActionForm>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">
          {tx(
            locale,
            'No headlines match your search/filter.',
            'Tidak ada headline yang cocok dengan pencarian/filter Anda.',
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                {canTriage ? (
                  <Checkbox
                    checked={selected.has(n.id)}
                    onChange={() => toggle(n.id)}
                    className="mt-0.5"
                    aria-label={`Select ${n.title}`}
                  />
                ) : null}
                <div className="min-w-0">
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {n.title}
                  </a>
                  <div className="mt-0.5 text-xs text-fg-subtle">
                    {n.source}
                    {n.publishedAt ? ` · ${new Date(n.publishedAt).toISOString().slice(0, 10)}` : ''}
                    {n.security ? ' · security' : ''}
                  </div>
                  <BrandSentiment
                    verdict={verdicts[n.id] ?? { sentiment: null, relevance: null, reason: null, feedback: null }}
                    loading={loadingIds.has(n.id)}
                    err={errIds[n.id] ?? ''}
                    canTriage={canTriage}
                    onGenerate={() => void generateOne(n.id)}
                    onMark={(v) => void markOne(n.id, v)}
                    locale={locale}
                  />
                </div>
              </div>
              {canTriage ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <NewsStatusBadge status={n.status} />
                  <ActionForm action={setBrandNewsStatusAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={n.id} />
                    <AutoSubmitSelect
                      key={n.status}
                      name="status"
                      defaultValue={n.status}
                      className="h-8 w-36 text-xs"
                      aria-label="Change status"
                    >
                      {STATUS_OPTIONS.map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </ActionForm>
                </div>
              ) : (
                <Badge variant="neutral" className="shrink-0">
                  {NEWS_STATUS_LABEL[n.status as keyof typeof NEWS_STATUS_LABEL] ?? n.status}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
