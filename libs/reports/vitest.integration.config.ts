import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
