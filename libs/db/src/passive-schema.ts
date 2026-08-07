import { integer, pgTable, serial, text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { projects } from './schema';
import { targets, scans } from './recon-schema';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Editable file-category buckets (backups/configs/keys/…) - seeded from DEFAULT_CATEGORIES. */
export const extensionCategories = pgTable('extension_categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  iconKey: text('icon_key'),
});

export const extensionSuffixRules = pgTable('extension_suffix_rules', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => extensionCategories.id, { onDelete: 'cascade' }),
  suffix: text('suffix').notNull().unique(), // lower-cased, dot-prefixed
});

/** A URL discovered for a target via passive OSINT (VirusTotal undetected-URLs, Wayback CDX). */
export const discoveredUrls = pgTable(
  'discovered_urls',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').references(() => targets.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    // The scan that FIRST discovered this URL (set on insert, never updated) - powers scan-diff.
    firstScanId: uuid('first_scan_id').references(() => scans.id, { onDelete: 'set null' }),
    host: text('host'),
    urlText: text('url_text').notNull(),
    urlSha256: text('url_sha256').notNull(),
    sources: text('sources').array().notNull().default([]), // virustotal | wayback
    pathnameExtension: text('pathname_extension'),
    categorySlug: text('category_slug'),
    externalSeenAt: timestamp('external_seen_at', { withTimezone: true }),
    // Deep-fetch state (SSRF-guarded body fetch): skipped | pending | done | failed | blocked.
    deepScanState: text('deep_scan_state').notNull().default('skipped'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    httpStatus: integer('http_status'),
    contentLength: integer('content_length'),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqProjectUrl: uniqueIndex('discovered_urls_project_url_uniq').on(t.projectId, t.urlSha256),
    byProject: index('discovered_urls_project_idx').on(t.projectId),
    byCategory: index('discovered_urls_category_idx').on(t.projectId, t.categorySlug),
  }),
);

/** Exposure finding - a secret/credential pattern matched in a discovered URL or fetched body. */
export const exposureFindings = pgTable(
  'exposure_findings',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    discoveredUrlId: uuid('discovered_url_id').references(() => discoveredUrls.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    source: text('source').notNull().default('url'), // url | body
    findingType: text('finding_type').notNull(),
    snippet: text('snippet'), // CONFIDENTIAL: masked in UI, never logged
    urlText: text('url_text'),
    status: text('status').notNull().default('new'), // reuse triage statuses
    // Free-form analyst note (investigation context, false-positive reason, etc.).
    analystNote: text('analyst_note'),
    createdAt: createdAt(),
  },
  (t) => ({
    byProject: index('exposure_findings_project_idx').on(t.projectId),
    byType: index('exposure_findings_type_idx').on(t.projectId, t.findingType),
    uniqProjectUrlType: uniqueIndex('exposure_findings_uniq').on(t.projectId, t.urlText, t.findingType, t.snippet),
  }),
);

/** Passive-DNS IP resolution for a target (apex/subdomain ↔ IP history; origin-behind-WAF). */
export const ipResolutions = pgTable(
  'ip_resolutions',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address').notNull(),
    latestResolvedAt: timestamp('latest_resolved_at', { withTimezone: true }).notNull(),
    hostnameCount: integer('hostname_count').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqProjectIp: uniqueIndex('ip_resolutions_project_ip_uniq').on(t.projectId, t.ipAddress),
    byProject: index('ip_resolutions_project_idx').on(t.projectId),
  }),
);

export const ipResolutionSightings = pgTable(
  'ip_resolution_sightings',
  {
    id: id(),
    ipResolutionId: uuid('ip_resolution_id')
      .notNull()
      .references(() => ipResolutions.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    hostname: text('hostname').notNull(),
    lastResolvedAt: timestamp('last_resolved_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqResolutionHost: uniqueIndex('ip_sightings_resolution_host_uniq').on(t.ipResolutionId, t.hostname),
    byResolution: index('ip_sightings_resolution_idx').on(t.ipResolutionId),
  }),
);
