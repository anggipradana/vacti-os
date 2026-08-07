import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './schema';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const webhooks = pgTable('webhooks', {
  id: id(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(), // discord | slack | telegram | google_chat | generic
  label: text('label'),
  url: text('url'),
  telegramToken: text('telegram_token'),
  telegramChatId: text('telegram_chat_id'),
  events: text('events').array().notNull().default([]), // empty = all
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
});

export const aiSettings = pgTable('ai_settings', {
  id: id(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' })
    .unique(),
  provider: text('provider').notNull().default('openai'), // openai | ollama
  model: text('model').notNull().default('gpt-4o-mini'),
  // Optional override endpoint for an OpenAI-compatible gateway (e.g. a local proxy or LiteLLM).
  // Blank = the provider's default cloud endpoint.
  baseUrl: text('base_url'),
  createdAt: createdAt(),
});

export const aiCache = pgTable('ai_cache', {
  id: id(),
  hash: text('hash').notNull().unique(),
  kind: text('kind').notNull(),
  output: text('output').notNull(),
  createdAt: createdAt(),
});

// System-wide default AI enrichment config (singleton row id='default'). Used as the fallback for
// projects that have not set their own ai_settings, instead of a hardcoded provider.
export const aiDefaults = pgTable('ai_defaults', {
  id: text('id').primaryKey().default('default'),
  provider: text('provider').notNull().default('openai'), // openai | ollama
  model: text('model').notNull().default('gpt-4o-mini'),
  baseUrl: text('base_url'),
  // System-wide API key for the default provider (AES-256-GCM, same scheme as the api_keys vault).
  // Fallback for projects whose vault has no key for that provider, so one key powers all projects.
  apiKeyCiphertext: text('api_key_ciphertext'),
  lastCheckStatus: text('last_check_status'), // valid | invalid | error (persistent badge)
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// App-level outbound-proxy setting (singleton row id='default'). The worker routes its OSINT/deep-fetch
// traffic through proxy_url when set; empty/null = no proxy. Web-configurable in Settings > Network, so
// a full-web operator can set it without editing env (env.PROXY_URL stays the fallback).
export const networkSettings = pgTable('network_settings', {
  id: text('id').primaryKey().default('default'),
  proxyUrl: text('proxy_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationsSchema = { webhooks, aiSettings, aiCache, aiDefaults, networkSettings };
