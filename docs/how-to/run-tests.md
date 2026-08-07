# How to Run Tests

- **Unit (fast):** `npm run test:quick`
- **Integration (needs Postgres):** `npm run test:integration`
- **E2E (Playwright):** `npm run e2e`
- **Affected only:** `npm run affected:test`

Integration/E2E expect a Postgres reachable via `DATABASE_URL`. Locally: `docker compose up db`.
