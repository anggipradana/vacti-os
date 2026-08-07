import Form from 'next/form';
import { Newspaper } from 'lucide-react';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Select } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { ActionForm, ActionSubmit } from '../../../components/ui/action-form';
import { NEWS_STATUS_LABEL } from '@vacti/core';
import { brandNews } from '@vacti/db';
import { getDb } from '../../../lib/db';
import { bulkReviewBrandNewsAction, refreshBrandNewsAction } from '../../../lib/threat-actions';
import { tx, type Locale } from '../../../lib/i18n';
import { NewsTriageButton } from './news-triage-button';
import { BrandNewsList } from './brand-news-list';

/**
 * Brand monitoring: public news mentioning the project's brand/domain (Google News RSS, key-less,
 * security-biased). Persisted per project so analysts can triage each headline (status survives
 * refreshes). Rendered from the DB; refreshed by the worker ti-refresh job + the "Search now" button.
 */
export async function BrandNews({
  projectId,
  brand,
  canTriage,
  filter = 'all',
  newsFilter = 'all',
  leakFilter = 'all',
  locale = 'en',
}: {
  projectId: string;
  brand: string;
  canTriage: boolean;
  filter?: string;
  newsFilter?: string;
  leakFilter?: string;
  locale?: Locale;
}) {
  const db = getDb();

  // Render straight from the DB (fast + reliable - no external fetch on the render path). Brand news
  // is populated by the worker's ti-refresh job and the on-demand "Search now" button.
  const rows = await db
    .select()
    .from(brandNews)
    .where(eq(brandNews.projectId, projectId))
    .orderBy(desc(brandNews.publishedAt))
    .limit(20);
  const items = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="size-4 text-accent" /> {tx(locale, 'Brand monitoring', 'Brand monitoring')} · {brand}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Form action="/threat" className="flex items-center gap-1.5">
            <input type="hidden" name="project" value={projectId} />
            <input type="hidden" name="news" value={newsFilter} />
            <input type="hidden" name="leak" value={leakFilter} />
            <Select name="bnews" defaultValue={filter} className="h-8 w-36 text-xs" aria-label="Filter brand news">
              <option value="all">{tx(locale, 'All statuses', 'Semua status')}</option>
              {Object.entries(NEWS_STATUS_LABEL).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="ghost" size="sm">
              {tx(locale, 'Filter', 'Filter')}
            </Button>
          </Form>
          {canTriage ? (
            <>
              <ActionForm
                action={refreshBrandNewsAction}
                className="flex items-center gap-1.5"
                confirm={tx(
                  locale,
                  'Searching for new news keeps only the newest 15 headlines and removes older stored ones. Continue?',
                  'Mencari news baru hanya menyimpan 15 headline terbaru dan menghapus yang lebih lama. Lanjutkan?',
                )}
              >
                <input type="hidden" name="projectId" value={projectId} />
                <Input
                  name="query"
                  defaultValue={brand}
                  placeholder={tx(locale, 'brand / keyword', 'brand / kata kunci')}
                  className="h-8 w-44 text-xs"
                  aria-label="Brand search term"
                />
                <ActionSubmit variant="primary" size="sm">
                  {tx(locale, 'Search now', 'Cari sekarang')}
                </ActionSubmit>
              </ActionForm>
              <ActionForm action={bulkReviewBrandNewsAction} className="flex items-center gap-1.5">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="filter" value={filter} />
                <Select name="status" defaultValue="reviewed" className="h-8 w-36 text-xs" aria-label="Bulk status">
                  {Object.entries(NEWS_STATUS_LABEL).map(([val, label]) => (
                    <option key={val} value={val}>
                      {tx(locale, 'Mark all', 'Tandai semua')}: {label}
                    </option>
                  ))}
                </Select>
                <ActionSubmit variant="outline" size="sm">
                  {tx(locale, 'Apply', 'Terapkan')}
                </ActionSubmit>
              </ActionForm>
              <NewsTriageButton projectId={projectId} kind="brand" locale={locale} />
            </>
          ) : (
            <span className="text-xs text-fg-subtle">{tx(locale, 'public news', 'news publik')}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            {tx(
              locale,
              'No recent public news mentioning this brand.',
              'Tidak ada news publik terbaru yang menyebut brand ini.',
            )}
          </p>
        ) : (
          <BrandNewsList
            locale={locale}
            items={items.map((n) => ({
              id: n.id,
              title: n.title,
              link: n.link,
              source: n.source,
              publishedAt: n.publishedAt ? new Date(n.publishedAt).toISOString() : null,
              security: Boolean(n.security),
              status: n.status,
              aiSentiment: n.aiSentiment,
              aiRelevance: n.aiRelevance,
              aiSentimentReason: n.aiSentimentReason,
              sentimentFeedback: n.sentimentFeedback,
            }))}
            canTriage={canTriage}
          />
        )}
      </CardContent>
    </Card>
  );
}
