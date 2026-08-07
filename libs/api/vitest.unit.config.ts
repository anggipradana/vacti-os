import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

// Unit tests only: pure-function specs (no Postgres). The integration suite (*.integration.test.ts) is run
// separately by vitest.integration.config.ts and is EXCLUDED here so `test:quick` never needs a database.
export default defineConfig({
  root,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    // The api lib currently ships only the integration suite; the pure-function unit specs were removed
    // with the features they covered, so an empty unit run is a pass, not a failure.
    passWithNoTests: true,
  },
});
