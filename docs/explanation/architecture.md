# Architecture & Design Rationale (Explanation)

vacti is a lightweight, self-hosted platform focused on Vulnerability Assessment + Threat
Intelligence.

## Shape

- **app** (Next.js 15): UI + tRPC + Hono REST (`/api`) + OpenAPI + SSE.
- **worker** (Node): pg-boss consumer running the recon pipeline, TI refresh, report rendering.
- **db** (PostgreSQL 16): application data **and** the job queue (pg-boss schema). No Redis.

These three services are the whole of vacti. There is no fourth runtime and no external dependency:
the app serves the UI and API, the worker runs the recon and threat-intel jobs, and Postgres holds
both the data and the job queue.

## Why these choices

- **pg-boss over Celery/Redis:** one datastore, fewer moving parts, jobs survive restarts.
- **All-Go recon tools** (subfinder/httpx/naabu/nuclei) + **nuclei wordfence** for WordPress instead
  of Ruby WPScan - single scanner runtime, no Ruby.
- **Playwright for PDF** (same tool as e2e) - freedom to redesign reports; no WeasyPrint/Python.
- **Unified risk score** is a pure function reused by dashboard, TI page, and report -> identical (+/-0).

See [`docs/planning/`](../planning/) for the full decision record and feature parity checklist.
