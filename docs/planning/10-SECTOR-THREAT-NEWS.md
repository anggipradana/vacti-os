# vacti - Sector Threat News / Security Feed (2026-06-05)

> Add a sector-selectable security-news feed to Threat Intel: aggregate free security-news RSS/Atom
> feeds, filter by the project's chosen **sector** (keyword sets), cache, and show on the TI page (+ TI
> report). No paid API key. Maps a TI enhancement (new).

## A. Why RSS + keyword filtering

Easiest, free, reliable: RSS/Atom feeds are stable and key-less; sector relevance = a curated keyword
set per sector (a per-sector keyword pattern, generalised). A paid News API can be added
later behind the same interface for richer/region-specific coverage.

## B. Data model

- `projects.sector` (text, default `banking`) - the project's chosen sector.
- `threat_news` table (sector-keyed, shared across projects of the same sector):
  `id, sector, title, link (unique per sector), source, summary, publishedAt, status, fetchedAt`.
- `status` (text, default `new`) - analyst triage status (`NewsStatus`: new, reviewed, relevant,
  actioned, dismissed). **Preserved across refreshes** by upserting on `(sector, link)` and never
  writing `status` in the conflict-update set - mirrors the LeakCheck-finding triage requirement.

## C. Library (`@vacti/threat-intel`)

- `news.ts`: `SECTORS` (banking, healthcare, government, energy, technology, retail, general) →
  keyword arrays; `FEEDS` (The Hacker News, BleepingComputer, KrebsOnSecurity, CISA advisories,
  SecurityWeek…); `parseFeed(xml)` (pure - RSS `<item>` + Atom `<entry>`, unit-tested);
  `matchesSector(item, sector)`; `fetchSectorNews(sector, { feeds?, fetchImpl?, limit? })` - fetches
  each feed (timeout, per-feed try/catch → degrade), parses, filters by sector keywords, dedupes by
  link, sorts by date, caps. Network injected for tests.

## D. Refresh + storage

- Fold into the TI refresh job: after OTX/LeakCheck, fetch news for the project's sector and upsert
  into `threat_news` (dedupe by `sector+link`, `onConflictDoUpdate` refreshes content but keeps
  `status`). Sector-`general` skips keyword filtering.
- Also exposed as part of the existing TI refresh button (no new job needed).

## E. UI + report

- TI page: a **"Security news · <sector>"** card with a sector `<select>` (saved via an action on the
  project) + a list (title → link, source, date) and a per-item triage **status** selector
  (`setNewsStatusAction`, ModifyScanResults). Changing the sector triggers a refresh.
- TI report: a **"Sector Security News" (05)** section listing the top 15 headlines with source, date
  and triage **status** columns - rendered only when news is present.

## F. Tests

- Unit: `parseFeed` parses RSS + Atom samples; `matchesSector` filters by keyword; `fetchSectorNews`
  with a mocked fetch returns filtered/deduped/sorted items + degrades on a failing feed.
- e2e: change the sector on the TI page (smoke; live feeds not asserted).

## G. Out of scope (now)

Region-specific local CERT feeds and a paid News API - same interface, add later. Full-text
article ingestion / NLP classification (keyword match is enough for relevance).
