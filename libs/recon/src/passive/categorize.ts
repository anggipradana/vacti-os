/**
 * Content analysis - categorise a discovered URL by its pathname file extension. Helps surface
 * sensitive files (backups, configs, keys, documents) in the attack surface. Default categories
 * below are seeded into the DB and editable by analysts (extension_categories / suffix rules).
 */

/** Extension from the pathname only (ignores query/hash). Returns e.g. ".sql" or null. */
export function pathnameExtension(urlText: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`);
    const seg = u.pathname.split('/').pop() ?? '';
    const q = seg.indexOf('?');
    const base = q >= 0 ? seg.slice(0, q) : seg;
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return null;
    return base.slice(dot).toLowerCase();
  } catch {
    return null;
  }
}

export interface CategorySeed {
  slug: string;
  displayName: string;
  /** lower-cased, dot-prefixed suffixes */
  suffixes: string[];
}

/** Default categories - security-relevant file buckets (backups/configs/keys ranked first). */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  {
    slug: 'backups',
    displayName: 'Backups',
    suffixes: ['.bak', '.old', '.backup', '.7z', '.zip', '.rar', '.tar', '.tar.gz', '.tgz', '.gz'],
  },
  { slug: 'db-dumps', displayName: 'Database dumps', suffixes: ['.sql', '.dump', '.db', '.sqlite', '.mdb', '.bson'] },
  {
    slug: 'configs',
    displayName: 'Config files',
    suffixes: ['.env', '.yml', '.yaml', '.ini', '.conf', '.cfg', '.toml', '.properties'],
  },
  {
    slug: 'keys',
    displayName: 'Keys & certs',
    suffixes: ['.pem', '.key', '.pfx', '.p12', '.crt', '.cer', '.ppk', '.asc', '.gpg'],
  },
  {
    slug: 'documents',
    displayName: 'Documents',
    suffixes: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.rtf'],
  },
  {
    slug: 'source',
    displayName: 'Source code',
    suffixes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py', '.rb', '.go', '.java', '.cs', '.map', '.json'],
  },
  { slug: 'logs', displayName: 'Logs', suffixes: ['.log', '.out', '.trace'] },
  {
    slug: 'archives-media',
    displayName: 'Media & binaries',
    suffixes: ['.exe', '.dll', '.apk', '.jar', '.war', '.bin', '.iso', '.dmg'],
  },
];

/** Build a suffix→slug lookup from category seeds (longest suffix wins, e.g. .tar.gz over .gz). */
export function buildSuffixIndex(cats: CategorySeed[] = DEFAULT_CATEGORIES): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of cats) for (const s of c.suffixes) idx.set(s.toLowerCase(), c.slug);
  return idx;
}

/**
 * Categorise a URL: returns { extension, categorySlug } where categorySlug may be null if the
 * extension matches no rule. Matches the longest known suffix (so foo.tar.gz → backups via .tar.gz).
 */
export function categorizeUrl(
  urlText: string,
  suffixIndex: Map<string, string> = buildSuffixIndex(),
): { extension: string | null; categorySlug: string | null } {
  let name = '';
  try {
    name = (
      new URL(/^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`).pathname.split('/').pop() ?? ''
    ).toLowerCase();
  } catch {
    return { extension: pathnameExtension(urlText), categorySlug: null };
  }
  // Longest matching known suffix wins (so foo.tar.gz → backups via .tar.gz, and dotfiles like
  // .env still match). Handles both multi-part and single-part suffixes uniformly.
  let best: string | null = null;
  let bestSlug: string | null = null;
  for (const [suffix, slug] of suffixIndex) {
    if (name.endsWith(suffix) && (best === null || suffix.length > best.length)) {
      best = suffix;
      bestSlug = slug;
    }
  }
  if (best) return { extension: best, categorySlug: bestSlug };
  return { extension: pathnameExtension(urlText), categorySlug: null };
}
