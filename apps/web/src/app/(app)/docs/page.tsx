import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { BookOpen } from 'lucide-react';
import { getCurrentUser } from '../../../lib/session';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';
import { DocsViewer, type Doc } from './docs-viewer';

export const dynamic = 'force-dynamic';

// User-facing docs (Diátaxis: tutorial / how-to / explanation), rendered from the repo's markdown.
const PAGES: { slug: string; title: string; path: string }[] = [
  { slug: 'getting-started', title: 'Getting started', path: 'docs/tutorials/getting-started.md' },
  { slug: 'architecture', title: 'Architecture', path: 'docs/explanation/architecture.md' },
  { slug: 'deploy', title: 'Deploy', path: 'docs/how-to/deploy.md' },
  { slug: 'tests', title: 'Running tests', path: 'docs/how-to/run-tests.md' },
  { slug: 'qa', title: 'QA (Playwright UI)', path: 'docs/how-to/qa-with-playwright-ui.md' },
];

// Repo base for resolving relative markdown links to the file on GitHub (overridable via env).
const REPO_BLOB = process.env.DOCS_REPO_URL ?? 'https://github.com/anggipradana/vacti-os/blob/main';

async function loadDocs(): Promise<Doc[]> {
  const root = process.cwd();
  const out: Doc[] = [];
  for (const p of PAGES) {
    try {
      const markdown = await readFile(join(root, p.path), 'utf8');
      out.push({ slug: p.slug, title: p.title, path: p.path, markdown });
    } catch {
      // Skip a doc that isn't present in this build.
    }
  }
  return out;
}

export default async function DocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const docs = await loadDocs();

  return (
    <>
      <PageHeader
        title={tx(locale, 'Documentation', 'Dokumentasi')}
        description={tx(
          locale,
          'How to use vacti. For the scriptable REST API, see the API reference.',
          'Cara menggunakan vacti. Untuk REST API yang dapat di-script, lihat API reference.',
        )}
        actions={
          <Button asChild variant="secondary">
            <a href="/api/docs" target="_blank" rel="noopener noreferrer">
              {tx(locale, 'API reference (Redoc) →', 'API reference (Redoc) →')}
            </a>
          </Button>
        }
      />
      {docs.length ? (
        <DocsViewer docs={docs} repoBase={REPO_BLOB} locale={locale} />
      ) : (
        <EmptyState
          icon={<BookOpen />}
          title={tx(locale, 'No docs found', 'Dokumentasi tidak ditemukan')}
          description={tx(
            locale,
            "The documentation markdown wasn't bundled in this build.",
            'Markdown dokumentasi tidak disertakan dalam build ini.',
          )}
        />
      )}
    </>
  );
}
