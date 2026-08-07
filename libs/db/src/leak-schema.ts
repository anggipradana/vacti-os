import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { projects, users } from './schema';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/**
 * "Leaks" feature: a global (non-tenancy) credential-leak search tool that fans out to multiple leak
 * providers (white-labeled - the provider names never reach a non-admin). Admin controls per-provider keys
 * + enable, and a per-user daily/monthly search quota via named packages. Searches are EPHEMERAL by default;
 * a user opts in to persist one as a named "Case" (query + encrypted result snapshot).
 */

/**
 * Global provider config - the ONE place a real provider name (e.g. 'leakcheck') appears.
 * `enabled` gates whether the provider is queried; `keyCiphertext` is an admin-set encrypted key that
 * OVERRIDES the env fallback (LEAKCHECK_API_KEY). Runtime never exposes name/key to users.
 */
export const leakProviders = pgTable('leak_providers', {
  provider: text('provider').primaryKey(), // 'leakcheck' (internal id, never shown to users)
  enabled: boolean('enabled').notNull().default(true),
  keyCiphertext: text('key_ciphertext'), // AES-256-GCM (vault); null => fall back to the env key
  updatedAt: updatedAt(),
});

/** Admin-defined quota package. null limit = unlimited. Assigned to users via leak_user_access. */
export const leakPackages = pgTable('leak_packages', {
  id: id(),
  name: text('name').notNull().unique(),
  dailyLimit: integer('daily_limit'), // searches/day; null = unlimited
  monthlyLimit: integer('monthly_limit'), // searches/month; null = unlimited
  isDefault: boolean('is_default').notNull().default(false), // package new users get
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Per-user Leaks access: an assigned package and/or explicit overrides. Effective daily limit =
 * dailyLimitOverride ?? package.dailyLimit ?? default-package.dailyLimit. A user with no row falls back to
 * the default package. SysAdmin bypasses quota entirely (enforced in code, not here).
 */
export const leakUserAccess = pgTable('leak_user_access', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  packageId: uuid('package_id').references(() => leakPackages.id, { onDelete: 'set null' }),
  dailyLimitOverride: integer('daily_limit_override'),
  monthlyLimitOverride: integer('monthly_limit_override'),
  updatedAt: updatedAt(),
});

/** Per-user, per-day search counter (PG-backed, no Redis). Incremented once per executed search. */
export const leakUsage = pgTable(
  'leak_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(), // UTC calendar day
    count: integer('count').notNull().default(0),
  },
  (t) => ({ pk: uniqueIndex('leak_usage_user_day_uniq').on(t.userId, t.day) }),
);

/**
 * A saved "Case": the user OPTED IN to persist a search. Holds the query + metadata; the row snapshot lives
 * in leak_search_results. Optionally attached to a project. Owned by the creating user (not tenancy-scoped).
 */
export const leakSearches = pgTable(
  'leak_searches',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    query: text('query').notNull(),
    searchType: text('search_type'), // optional typed hint (email/domain/...) - null = auto/freeform
    note: text('note'),
    tags: text('tags').array().notNull().default([]),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }), // optional attach
    resultCount: integer('result_count').notNull().default(0),
    sourceCount: integer('source_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byUser: index('leak_searches_user_idx').on(t.userId) }),
);

/**
 * One snapshot row inside a saved Case. `source` = the breach/database NAME (safe to show - it is the leak
 * source, not the provider tool). `provider` is the internal API that returned it (leakcheck) -
 * kept for dedup/debug, NEVER shown to a non-admin. Passwords are stored ENCRYPTED and masked in the UI.
 */
export const leakSearchResults = pgTable(
  'leak_search_results',
  {
    id: id(),
    searchId: uuid('search_id')
      .notNull()
      .references(() => leakSearches.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // breach/DB name (shown)
    provider: text('provider').notNull(), // internal only (leakcheck)
    identifier: text('identifier'), // email/username/etc.
    passwordCiphertext: text('password_ciphertext'), // AES-256-GCM; null when no password in the record
    origin: text('origin'),
    extra: jsonb('extra'), // the raw freeform columns (rows vary per DB)
    status: text('status').notNull().default('new'), // new|reviewed|confirmed|false_positive
    createdAt: createdAt(),
  },
  (t) => ({ bySearch: index('leak_search_results_search_idx').on(t.searchId) }),
);
