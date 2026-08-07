import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { appBranding } from '@vacti/db';
import { getDb } from './db';

export type Branding = { appName: string; logoDataUri: string | null };

// The built-in fallback used before any row exists or if the lookup fails - matches the bundled /logo.svg.
export const DEFAULT_BRANDING: Branding = { appName: 'vacti', logoDataUri: null };

/**
 * The active workspace branding (name + logo), read once per request. Never throws - a missing table or
 * empty result falls back to the bundled vacti brand so the shell/login always render.
 */
export const getActiveBranding = cache(async (): Promise<Branding> => {
  try {
    const [row] = await getDb().select().from(appBranding).where(eq(appBranding.isActive, true)).limit(1);
    if (row) return { appName: row.appName, logoDataUri: row.logoDataUri ?? null };
  } catch {
    // table not migrated yet / db hiccup - fall back
  }
  return DEFAULT_BRANDING;
});
