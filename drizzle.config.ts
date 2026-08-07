import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './libs/db/src/schema.ts',
    './libs/db/src/recon-schema.ts',
    './libs/db/src/passive-schema.ts',
    './libs/db/src/threat-intel-schema.ts',
    './libs/db/src/reports-schema.ts',
    './libs/db/src/integrations-schema.ts',
    './libs/db/src/leak-schema.ts',
    './libs/db/src/backup-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? `postgres://vacti:${process.env.POSTGRES_PASSWORD ?? 'vacti'}@localhost:5432/vacti`,
  },
});
