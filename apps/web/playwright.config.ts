import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const STORAGE = 'apps/web/e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    // 1) Create the first-run admin and persist its authenticated storage state.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // 2) All e2e specs reuse that admin session.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `next dev apps/web -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: process.cwd(),
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        `postgres://vacti:${process.env.POSTGRES_PASSWORD ?? 'vacti'}@localhost:5432/vacti_e2e`,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
      NODE_ENV: 'development',
      // Isolated build dir when set, so the e2e server never shares .next with a running dev/live server.
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '',
    },
  },
});
