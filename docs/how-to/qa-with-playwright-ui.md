# How to QA with the Playwright UI (headed)

Playwright's UI/headed runner needs a graphical display. On any host with a desktop (or with an
X/Wayland display forwarded), set `DISPLAY` (e.g. `DISPLAY=:0`) and the runner opens in a desktop
window. CI always runs headless and needs no display.

## One-time setup

- Export a display for headed runs, e.g. `DISPLAY=:0` (and `WAYLAND_DISPLAY=wayland-0` if applicable).
- Install the headed browser system libs: `sudo npx playwright install-deps chromium`.
- Browser: `@playwright/test` pinned `1.48.2`.

## Run modes

```bash
# Env the app needs (Postgres + secrets); e2e DB = vacti_e2e
export DATABASE_URL="postgres://vacti:$POSTGRES_PASSWORD@localhost:5432/vacti_e2e"
export ENCRYPTION_KEY="dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzLXRlc3Q="

npm run e2e          # headless (CI parity) - all specs
npm run e2e:ui       # Playwright UI mode - interactive, watch/replay each step (desktop window)
npm run e2e:headed   # headed run - see the browser drive each flow
```

- **UI mode** (`e2e:ui`) opens the Playwright test explorer on the desktop: pick a spec, watch it run
  step-by-step, inspect the DOM/network/console at each action, and re-run on change. Best for human QA.
- **Headed** (`e2e:headed`) just shows the browser executing the suite end-to-end.
- CI always runs **headless** - the same specs, no display.

## Traces & screenshots (headless review)

`playwright.config.ts` keeps traces on first retry. To always capture for review:

```bash
npx playwright test -c apps/web/playwright.config.ts --trace on --reporter=line
npx playwright show-trace   # opens the trace viewer (desktop window)
```

Specs live in `apps/web/e2e/*.e2e.ts`. See the QA coverage matrix in
[docs/planning/07-QA-AND-POLISH-PLAN.md](../planning/07-QA-AND-POLISH-PLAN.md).
