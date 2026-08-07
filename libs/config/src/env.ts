import { z } from 'zod';

/** Validated environment for vacti. Fails fast at boot if required vars are missing/invalid. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  // 32-byte key, base64-encoded, for AES-256-GCM vault encryption.
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'ENCRYPTION_KEY must be 32 bytes (base64-encoded)',
    }),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  // Optional external integrations - features degrade gracefully when absent.
  OTX_API_KEY: z.string().optional(),
  LEAKCHECK_API_KEY: z.string().optional(),
  VT_API_KEY: z.string().optional(),
  URLSCAN_API_KEY: z.string().optional(),
  // Optional outbound proxy for OSINT/deep-fetch in the worker (http(s):// or socks5://).
  PROXY_URL: z.string().optional(),
  // Optional AI enrichment providers (features degrade gracefully when absent).
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  // Threat/brand news retention: rows older than this many days are pruned on each TI refresh
  // (analyst-flagged "relevant"/"actioned" headlines are always kept). Keeps the DB light.
  NEWS_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty-string vars as unset - container orchestrators commonly pass optional vars as
  // `KEY=` (e.g. compose `${VAR:-}`), which would otherwise fail `.email()`/`.url()`/`.min()`.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) if (v !== '') cleaned[k] = v;
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
