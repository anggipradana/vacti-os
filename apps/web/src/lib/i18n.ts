// Lightweight platform i18n. English is the primary language, Indonesian (ID) the second. This module is
// ISOMORPHIC (no next/headers) so both client and server components can translate. The current locale is
// read server-side from the `locale` cookie (see lib/locale.ts) and passed down; the top-right toggle
// (components/ui/language-toggle.tsx) flips it. Findings/reports are already bilingual (en+id) via the
// reports lib, so only the platform UI chrome lives here.

export type Locale = 'en' | 'id';
export const LOCALES: Locale[] = ['en', 'id'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'locale';

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'id';
}

type Dict = Record<string, { en: string; id: string }>;

// Translation table. Keys are dotted namespaces. Add entries as modules are localised; a missing key falls
// back to the English text (or the key itself), so partial coverage degrades gracefully.
const DICT: Dict = {
  // Top navigation. NOTE: established cybersecurity / industry terms stay in English in BOTH languages
  // (Vulnerability Assessment, Attack Surface, Cyber Threat Intel, VA) - translating them reads
  // wrong to practitioners. Only generic UI terms are localised.
  'nav.dashboard': { en: 'Dashboard', id: 'Dashboard' },
  'nav.targets': { en: 'Targets', id: 'Target' },
  'nav.va': { en: 'Vulnerability Assessment', id: 'Vulnerability Assessment' },
  'nav.surface': { en: 'Attack Surface', id: 'Attack Surface' },
  'nav.threat': { en: 'Cyber Threat Intel', id: 'Cyber Threat Intel' },
  'nav.reports': { en: 'Reports', id: 'Laporan' },
  'nav.settings': { en: 'Settings', id: 'Pengaturan' },
  'nav.docs': { en: 'Docs', id: 'Docs' },

  // Shell / common
  'common.signOut': { en: 'Sign out', id: 'Keluar' },
  'common.menu': { en: 'Menu', id: 'Menu' },
  'common.language': { en: 'Language', id: 'Bahasa' },
  'common.back': { en: 'Back', id: 'Kembali' },
  'common.cancel': { en: 'Cancel', id: 'Batal' },
  'common.create': { en: 'Create', id: 'Buat' },
  'common.run': { en: 'Run', id: 'Jalankan' },
  'common.save': { en: 'Save', id: 'Simpan' },
  'common.delete': { en: 'Delete', id: 'Hapus' },
  'common.loading': { en: 'Loading...', id: 'Memuat...' },

};

/** Translate a key for a locale, with an optional explicit fallback (else the EN string, else the key). */
export function t(locale: Locale, key: string, fallback?: string): string {
  const entry = DICT[key];
  if (entry) return entry[locale] ?? entry.en;
  return fallback ?? key;
}

/** Bind a translator to a locale: `const tr = makeT(locale); tr('nav.dashboard')`. */
export function makeT(locale: Locale): (key: string, fallback?: string) => string {
  return (key, fallback) => t(locale, key, fallback);
}

/**
 * INLINE translator - no dictionary key needed: `tx(locale, 'Findings', 'Temuan')`. Use this for the bulk
 * of page-body strings (it keeps the English + Indonesian side by side at the call site, which is easy to
 * review and lets many pages be localised in parallel without touching a shared dictionary). RULE: keep
 * established cybersecurity / industry terms in English in BOTH args (Vulnerability Assessment, Attack
 * Surface, Cyber Threat Intel, VA, CVE, SQLi/XSS/IDOR, severity levels) - only translate generic UI.
 */
export function tx(locale: Locale, en: string, id: string): string {
  return locale === 'id' ? id : en;
}
