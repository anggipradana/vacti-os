import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isSysAdmin: boolean('is_sys_admin').notNull().default(false),
  // Global RBAC role (RoleName from @vacti/core). Source of truth for permission checks. Defaults to the
  // LEAST-privileged role (Auditor, read-only): a row inserted without an explicit role must fail CLOSED,
  // never silently become a near-admin PenetrationTester. Every real create path sets the role explicitly.
  role: text('role').notNull().default('Auditor'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // absolute cap
  // Sliding idle-timeout anchor: refreshed (throttled) on activity; a session idle past the idle window is
  // reaped even if still within its absolute cap. See apps/web/src/lib/session.ts.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

// Brute-force throttle for the login form. PG-backed (no Redis): one row per email, a rolling
// window of recent failures + a soft-lockout timestamp. Cleared on a successful login.
export const loginAttempts = pgTable('login_attempts', {
  email: text('email').primaryKey(),
  failures: integer('failures').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const apiTokens = pgTable('api_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const projects = pgTable('projects', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Chosen sector for the threat-news feed (SectorName from @vacti/threat-intel).
  sector: text('sector').notNull().default('banking'),
  // The default workspace shown on login / when no project is explicitly selected. At most one true.
  isDefault: boolean('is_default').notNull().default(false),
  // Optional override search term for brand monitoring (defaults to the project name when null).
  brandQuery: text('brand_query'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Aggregated sector security-news (RSS), keyed by sector + link. */
export const threatNews = pgTable(
  'threat_news',
  {
    id: id(),
    sector: text('sector').notNull(),
    title: text('title').notNull(),
    link: text('link').notNull(),
    source: text('source').notNull(),
    summary: text('summary'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Triage status (NewsStatus from @vacti/core) - preserved across feed refreshes.
    status: text('status').notNull().default('new'),
    fetchedAt: createdAt(),
  },
  (t) => ({
    uniqSectorLink: uniqueIndex('threat_news_sector_link_uniq').on(t.sector, t.link),
    sectorPublishedIdx: index('threat_news_sector_published_idx').on(t.sector, t.publishedAt),
  }),
);

// Brand monitoring: public news mentioning a project's brand/domain (per project, triageable).
export const brandNews = pgTable(
  'brand_news',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    link: text('link').notNull(),
    source: text('source').notNull(),
    summary: text('summary'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Whether the headline came from the security-biased query (vs a general brand mention).
    security: boolean('security').notNull().default(false),
    // Triage status (NewsStatus from @vacti/core) - preserved across feed refreshes.
    status: text('status').notNull().default('new'),
    // AI reputation verdict toward the brand (on-demand): sentiment (positive|negative|neutral) +
    // relevance (relevant|irrelevant: is it actually about this company vs a name-match).
    aiSentiment: text('ai_sentiment'),
    aiRelevance: text('ai_relevance'),
    aiSentimentReason: text('ai_sentiment_reason'),
    sentimentCheckedAt: timestamp('sentiment_checked_at', { withTimezone: true }),
    // Analyst feedback on the AI verdict (a learning signal): correct | incorrect.
    sentimentFeedback: text('sentiment_feedback'),
    fetchedAt: createdAt(),
  },
  (t) => ({ uniqProjectLink: uniqueIndex('brand_news_project_link_uniq').on(t.projectId, t.link) }),
);

export const projectMembers = pgTable(
  'project_members',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // RoleName from @vacti/core (SysAdmin | PenetrationTester | Auditor)
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ uniqMember: uniqueIndex('project_members_project_user_uniq').on(t.projectId, t.userId) }),
);

export const apiKeys = pgTable('api_keys', {
  id: id(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // AES-256-GCM ciphertext (see @vacti/auth vault). Never stored in plaintext.
  ciphertext: text('ciphertext').notNull(),
  // Rotation/quota/backoff (for rate-limited OSINT providers like VirusTotal). All in Postgres.
  usageCount: integer('usage_count').notNull().default(0),
  usageDate: timestamp('usage_date', { withTimezone: true }),
  disabledUntil: timestamp('disabled_until', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  // Last validity-check verdict ('valid' | 'invalid' | 'error') + when it ran, so the UI can
  // show a persistent status badge instead of a one-shot result after the Test click.
  lastCheckStatus: text('last_check_status'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => ({
    createdIdx: index('audit_log_created_idx').on(t.createdAt),
  }),
);

// App branding presets: the workspace name + logo shown in the shell header, login, and browser tab.
// One row is is_active; exactly one row is is_default (the built-in "vacti" brand, never deleted, the
// revert target). Operators can save multiple named presets ("brands we made before") and switch between
// them. logoDataUri is a self-contained data: URI (null falls back to the bundled /logo.svg).
export const appBranding = pgTable('app_branding', {
  id: id(),
  label: text('label').notNull(),
  appName: text('app_name').notNull(),
  logoDataUri: text('logo_data_uri'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const schema = {
  users,
  sessions,
  apiTokens,
  projects,
  projectMembers,
  apiKeys,
  auditLog,
  threatNews,
  brandNews,
  appBranding,
};
