# vacti - UI Polish & Comprehensive QA Plan (2026-06-05)

> Goal: bring the UI to a consistent, accessible, pro-grade finish, then prove every function works via
> a comprehensive Playwright e2e suite (runnable headless for CI and headed/UI for human review), fixing
> defects as they surface. All work lands on `main` only behind a green gate
> (typecheck + lint + unit + integration + e2e).

## A. Display / GUI for Playwright

- Headed + UI mode need a graphical display: export `DISPLAY` (e.g. `DISPLAY=:0`, plus
  `WAYLAND_DISPLAY` if applicable) so the runner opens in a desktop window. No full desktop install required.
- Install Playwright's headed system libs (`npx playwright install-deps chromium`) so headed + UI mode work.
- `npm run e2e:ui` → `playwright test --ui` (headed) for human QA.
- CI stays **headless** (no display) - the same specs run both ways.

## B. UI polish pass (real defects first - not subjective tweaks)

Source: full read of every page/component (survey 2026-06-05). NOTE: web font is **Plus Jakarta Sans**
(approved); the "use Space Grotesk" survey note is a false positive - Space Grotesk is the _report_ font.

1. **Enum strings shown raw** - `status-pill`, `timeline` render `in_progress` → "In_progress". Add a
   shared `humanizeStatus()`/label map so scan + finding statuses read properly everywhere.
2. **Broken class** - `settings/reports` signatory row uses `className="muted text-fg-subtle"` (`muted`
   is not a utility). Remove.
3. **Form submit feedback** - key forms (login, create-token, new-scan, schedules, add-target) submit via
   server actions with no pending state → add a shared `SubmitButton` using `useFormStatus`.
4. **Copy-to-clipboard** - the shown-once API token has a decorative copy icon with no behaviour → make it
   functional with a toast.
5. **Consistent empty-states** - replace ad-hoc `<p>No …</p>` fallbacks (users, target notes) with the
   `EmptyState` component.
6. **Accessibility** - icon-only buttons (delete "✕", theme toggle, copy) get `aria-label`/`title`.
7. **Status colour** - `queued` shares grey with `cancelled`; give `queued` its own tone.
8. **Responsive** - tighten cramped form grids (`/schedules`, `/targets`, `/threat`) at the `md` breakpoint.
9. **Destructive confirms** - delete actions (webhook, schedule, token, note, signatory) get a confirm step.

## C. QA coverage matrix (every function → an e2e check)

Specs under `apps/web/e2e/`, split by area; each asserts the happy path + at least one guard.

| Area         | Flows covered                                                                              |
| ------------ | ------------------------------------------------------------------------------------------ |
| Auth/RBAC    | create-admin, login/logout, session guard redirect; Auditor cannot mutate (server guard)   |
| Projects     | create project; appears in lists/selectors                                                 |
| Targets      | create (with predefined subs + custom headers); detail page; recon notes add/toggle/delete |
| Scans        | start scan, live detail, status pill, cancel; pagination; rescan/sub-scan; diff/compare    |
| Schedules    | create (cron preset), pause/enable, delete; invalid cron rejected                          |
| Threat Intel | page renders, risk gauge, add indicator, leak status select, refresh enqueue, AI narrative |
| Reports      | VA + TI PDF endpoints return application/pdf; settings (branding, signatory, logo, exec)   |
| Integrations | webhook add/test/delete; AI provider save; vault key set/clear (masked)                    |
| Search       | universal search returns categorised hits; empty query                                     |
| Settings     | users/roles (SysAdmin), audit log viewer shows entries                                     |
| Dashboard    | overview tiles, charts, onboarding checklist, recent scans                                 |
| API          | (covered by integration suite) - bearer auth, RBAC 403s, pagination, search, cancel, diff  |

## D. Execution loop (don't stop until green)

1. Polish defect → fix → typecheck/lint.
2. Write/extend e2e spec for each area.
3. Run `e2e` headless; on any failure, fix the app (not the test, unless the test is wrong) and re-run.
4. Periodically review headed (`e2e:ui`) + screenshots/trace for visual correctness.
5. Final full gate green: typecheck (12) + lint (12) + unit (9) + integration (6) + e2e. Commit per area.

## E. Out of scope

Pixel-level subjective restyles, multi-browser (chromium only), load/perf testing. Deferred v1 items
(proxy, multi-org, WHOIS, in-app feed) are not QA targets.

## F. Multi-project scoping (root-cause addendum, 2026-06-05)

**Why this section exists.** The Targets, Scans, Schedules, and Dashboard pages shipped showing
_every_ project's rows at once, with no active-project filter. The e2e suite never caught it because
every spec exercised a **single-project happy path**: with one project, "show all" and "show this
project" are indistinguishable. The bug only appears with two or more projects.

**Rule.** Any page or endpoint that lists data belonging to a project (targets, scans, schedules,
vulnerabilities, leaks, indicators, TI, dashboard metrics) MUST:

1. Scope its queries to an active project (the `?project=` switcher pattern, see
   `apps/web/src/components/project-switcher.tsx`), never fetch across all projects.
2. Be covered by a **multi-project** e2e assertion: create two projects with distinct data, switch
   the active project, and assert each page shows only the selected project's data and never the
   other's. The guard lives in `apps/web/e2e/05-multi-project.e2e.ts`.

**QA dimension.** Single-project happy-path tests are necessary but not sufficient. Every list view
gets a two-project scoping check; "works with one project" is not evidence it scopes.
