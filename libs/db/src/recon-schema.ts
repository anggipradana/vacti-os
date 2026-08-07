import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './schema';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const targets = pgTable(
  'targets',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    predefinedSubdomains: text('predefined_subdomains').array().notNull().default([]),
    customHeaders: jsonb('custom_headers'),
    createdAt: createdAt(),
  },
  (t) => ({
    projectIdx: index('targets_project_idx').on(t.projectId),
  }),
);

export const scanProfiles = pgTable('scan_profiles', {
  id: id(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // which stages run: { subfinder, httpx, naabu, nuclei, wordfence }
  tools: jsonb('tools').notNull(),
  ports: text('ports').notNull().default('top-100'),
  severities: text('severities').array().notNull().default(['critical', 'high', 'medium', 'low']),
  rate: integer('rate'),
  timeoutSec: integer('timeout_sec'),
  // Advanced per-tool options + scan scoping (see ScanProfileConfig in @vacti/recon).
  config: jsonb('config'),
  createdAt: createdAt(),
});

export const scans = pgTable(
  'scans',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => targets.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => scanProfiles.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'), // queued|running|completed|failed|cancelled
    // active = binary recon pipeline; passive = OSINT-only (VT/Wayback); full = passive → feed → active.
    mode: text('mode').notNull().default('active'),
    // Passive deep-fetch: fetch discovered URL bodies (SSRF-guarded) and scan them for exposures.
    deepScan: boolean('deep_scan').notNull().default(false),
    stage: text('stage'),
    // Cross-process cancellation flag: the API/web sets it, the worker polls it and aborts the run.
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    // Partial-rescan tool subset (sub-scan): overrides the profile's tools when present.
    toolsOverride: jsonb('tools_override'),
    // Per-scan per-tool timeout (seconds). Wins over the profile/default when set so big
    // multi-domain scans can be given a longer budget (up to 10h = 36000s).
    timeoutSec: integer('timeout_sec'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    counts: jsonb('counts'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => ({
    projectIdx: index('scans_project_idx').on(t.projectId),
    targetIdx: index('scans_target_idx').on(t.targetId),
  }),
);

export const scanActivity = pgTable(
  'scan_activity',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    message: text('message'),
    createdAt: createdAt(),
  },
  (t) => ({
    scanIdx: index('scan_activity_scan_idx').on(t.scanId),
  }),
);

export const commands = pgTable('commands', {
  id: id(),
  scanId: uuid('scan_id')
    .notNull()
    .references(() => scans.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  argv: text('argv').array().notNull().default([]),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  createdAt: createdAt(),
});

export const subdomains = pgTable(
  'subdomains',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    source: text('source'),
    createdAt: createdAt(),
  },
  (t) => ({
    scanIdx: index('subdomains_scan_idx').on(t.scanId),
  }),
);

export const endpoints = pgTable(
  'endpoints',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    host: text('host'),
    port: text('port'),
    scheme: text('scheme'),
    title: text('title'),
    webServer: text('web_server'),
    statusCode: integer('status_code'),
    contentLength: integer('content_length'),
    tech: text('tech').array().notNull().default([]),
    isWordpress: integer('is_wordpress').notNull().default(0),
    // Flagged when the host/url/title matches an interesting keyword (admin/ftp/cpanel/…).
    isInteresting: boolean('is_interesting').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({
    scanIdx: index('endpoints_scan_idx').on(t.scanId),
  }),
);

/** Per-target recon notes / TODOs. */
export const reconNotes = pgTable('recon_notes', {
  id: id(),
  targetId: uuid('target_id')
    .notNull()
    .references(() => targets.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: createdAt(),
});

export const ports = pgTable(
  'ports',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    ip: text('ip').notNull(),
    port: integer('port').notNull(),
    protocol: text('protocol').notNull().default('tcp'),
    createdAt: createdAt(),
  },
  (t) => ({
    scanIdx: index('ports_scan_idx').on(t.scanId),
  }),
);

export const vulnerabilities = pgTable(
  'vulnerabilities',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull(),
    name: text('name').notNull(),
    severity: integer('severity').notNull(),
    type: text('type'),
    host: text('host'),
    port: text('port'),
    url: text('url'),
    matchedAt: text('matched_at'),
    tags: text('tags').array().notNull().default([]),
    request: text('request'),
    response: text('response'),
    // From the nuclei template's info block (CVSS / CVE / references / template prose).
    cvss: doublePrecision('cvss'),
    cveIds: text('cve_ids').array().notNull().default([]),
    references: text('references').array().notNull().default([]),
    description: text('description'),
    remediation: text('remediation'),
    // Triage status (see docs/planning/05-FINDING-STATUS.md). Only active statuses feed the risk score.
    status: text('status').notNull().default('open'),
    statusNote: text('status_note'),
    // Free-form analyst note (investigation context, false-positive reason, etc.).
    analystNote: text('analyst_note'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    // AI enrichment (api-and-integrations). Populated on demand; cached in ai_cache.
    aiDescription: text('ai_description'),
    aiImpact: text('ai_impact'),
    aiRemediation: text('ai_remediation'),
    isAiEnriched: boolean('is_ai_enriched').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({
    scanIdx: index('vulnerabilities_scan_idx').on(t.scanId),
  }),
);

/** Recurring scan schedules (lightweight pg-boss cron tick evaluates these). */
export const scanSchedules = pgTable(
  'scan_schedules',
  {
    id: id(),
    targetId: uuid('target_id')
      .notNull()
      .references(() => targets.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => scanProfiles.id, { onDelete: 'set null' }),
    cron: text('cron').notNull(), // standard 5-field cron, local server time
    enabled: boolean('enabled').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    targetIdx: index('scan_schedules_target_idx').on(t.targetId),
  }),
);

export const reconSchema = {
  targets,
  scanProfiles,
  scans,
  scanSchedules,
  reconNotes,
  scanActivity,
  commands,
  subdomains,
  endpoints,
  ports,
  vulnerabilities,
};
