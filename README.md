<p align="center">
  <img src="apps/web/public/logo.svg" alt="VACTI" width="96" height="106" />
</p>

<h1 align="center">vacti</h1>

> Lightweight, modern, reliable **Vulnerability Assessment and Cyber Threat Intelligence**
> platform. An independent, ground-up implementation in TypeScript: the essential recon and
> threat-intel value at a fraction of the weight.

Three lightweight services (app, worker, Postgres). No Redis, no Celery, no Ruby. End-to-end
TypeScript. The whole platform runs as a lean control plane you can host behind a single tunnel.

---

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Tutorial: your first scan](#tutorial-your-first-scan)
- [Using the platform](#using-the-platform)
- [API reference](#api-reference)
- [Reports](#reports)
- [Configuration](#configuration)
- [Testing and QA](#testing-and-qa)
- [Docker and deployment](#docker-and-deployment)
- [Project layout](#project-layout)
- [Security and scope](#security-and-scope)
- [Documentation](#documentation)
- [License](#license)

---

## What it does

- **Recon / VA**: one straight pipeline, `subfinder (optional) -> httpx -> naabu -> nuclei`, plus
  conditional **nuclei wordfence** templates for hosts detected as WordPress. All-Go tools.
  Per-finding CVSS / CVE / references, AI enrichment, and a triage status workflow.
- **Passive recon and exposure (Attack Surface)**: key-less OSINT discovery - **VirusTotal** (passive
  DNS: subdomains, undetected URLs, IP resolutions / origin-behind-WAF) + **Wayback Machine** (archived
  URLs). Discovered URLs are categorised by file type (backups / configs / keys / db-dumps / ...) and
  scanned by a 23-rule **exposure detector** (AWS / GCP / GitHub / Slack / Stripe keys, JWTs, private
  keys, DB URLs, basic-auth, stealer/combo creds, ...). Scan **modes**: `active` (binaries), `passive`
  (OSINT only, no traffic to target), `full` (passive -> feed -> active). Exposure findings feed the
  unified risk score; credential-class hits cross-link to leaked credentials.
- **Threat Intelligence**: OTX AlienVault + LeakCheck + manual indicators + sector security news
  (RSS, including Indonesian sources) + a unified **risk score** (with a passive **Exposure**
  component) that is identical across the dashboard, the TI page, and the reports.
- **Leaks**: query breached-credential exposure for a domain or email against **LeakCheck**, review
  hits, and optionally save them as tracked cases. Leak results feed the same triage workflow and
  cross-link with credential-class exposure findings.
- **Reports**: redesigned bilingual (EN/ID) PDF reports for VA and TI (cover, table of contents,
  donut + bar charts, subdomain inventory, vulnerability summary, finding cards, approval sheet),
  rendered with headless Chromium. Per-project branding (logo, colours, classification, signatories,
  executive summary).
- **Scans**: start / cancel, **scheduled** (cron), **sub-scan** (partial rescan), **diff** two scans,
  live SSE progress, full command + activity audit.
- **Platform**: multi-project workspaces, **RBAC** (SysAdmin / PenetrationTester / Auditor) enforced
  server-side, encrypted **API-key vault** (AES-256-GCM), audit log, universal search, and EN/ID
  interface localisation.
- **Integrations**: webhooks (Discord rich embed, Google Chat card, Slack, Telegram, generic),
  automatic alerts on high-severity findings and new leaks, **AI** enrichment + executive-summary /
  threat-narrative generation (OpenAI or Ollama), and a first-class typed REST API with OpenAPI docs.

## Stack

Next.js 15 (App Router) and React 19, Tailwind + shadcn/ui, tRPC + Hono + Zod, PostgreSQL + Drizzle
ORM, **pg-boss** (queue stored in Postgres, no Redis), Vercel AI SDK, Playwright (e2e **and** PDF
rendering), argon2id password hashing, an Nx monorepo, and Vitest.

## Architecture

```mermaid
flowchart TD
    Browser["Browser (UI)"] --> Web["Next.js app: web UI + REST API (Hono)"]
    Client["External CLI / API client"] --> Web
    Web -->|"read / write"| PG[("PostgreSQL: data + pg-boss job queue")]
    Web -->|"enqueue scan / TI jobs"| PG
    Worker["worker (pg-boss consumer)"] -->|"poll jobs"| PG
    Worker -->|"active recon pipeline"| Tools["subfinder / httpx / naabu / nuclei (Go on PATH)"]
    Worker -->|"passive recon"| OSINT["VirusTotal / Wayback Machine (HTTP APIs)"]
    Worker -->|"threat intel"| TI["OTX / LeakCheck / RSS feeds"]
    Worker -->|"persist results"| PG
```

The whole platform is exactly three services:

- **app** (Next.js): serves the UI and the typed REST API (Hono).
- **worker** (pg-boss consumer): runs recon scans, passive OSINT discovery, and threat-intel
  refreshes; shells out to the Go scanners for active work and calls HTTP APIs for passive work.
- **PostgreSQL**: single data store, and also the job queue (via pg-boss - no Redis).

See [`docs/explanation/architecture.md`](docs/explanation/architecture.md).

---

## Installation

### Prerequisites

| Requirement | Version        | Notes                                                    |
| ----------- | -------------- | -------------------------------------------------------- |
| Node.js     | 22 or newer    | the whole stack is TypeScript                            |
| PostgreSQL  | 16 or newer    | data store and job queue                                 |
| Go scanners | latest         | `subfinder`, `httpx`, `naabu`, `nuclei` on `PATH`        |
| Chromium    | via Playwright | PDF rendering and e2e; installed by `playwright install` |

The four ProjectDiscovery scanners are only needed for real active scans (the rest of the app runs
without them). Install them with Go:

```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest   # needs libpcap-dev
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
nuclei -update-templates                                              # fetch templates once
# ensure $(go env GOPATH)/bin is on your PATH
```

### Set up the project

```bash
# 1. Clone and install dependencies
git clone <repo-url> vacti && cd vacti
npm ci
npx playwright install chromium          # for PDF rendering + e2e

# 2. Configure environment
cp .env.example .env
#    Generate the encryption key and paste it into .env:
openssl rand -base64 32                   # -> ENCRYPTION_KEY (32-byte base64)

# 3. Create the database (example role vacti / vacti)
createuser vacti --pwprompt              # or use an existing role
createdb vacti -O vacti
#    set DATABASE_URL=postgres://vacti:vacti@localhost:5432/vacti in .env

# 4. Run migrations and seed the default scan profiles + keyword list
npm run db:migrate
npm run db:seed

# 5. Start the worker and the app (two terminals)
npx tsx apps/worker/src/main.ts          # terminal 1: job worker
npx next dev apps/web -p 3100            # terminal 2: web app + API
```

Open <http://localhost:3100>. There is no separate registration step: the first visit shows a
**"Create the first admin"** form, and that account becomes the SysAdmin.

> Shortcut: `make install` installs deps, `make migrate && make seed` prepares the DB, and `make dev`
> runs the app and worker together. `make help` lists every target.

---

## Tutorial: your first scan

A five-minute walkthrough once the app is running at <http://localhost:3100>.

1. **Create the admin.** On first load, fill the email + password form. You are now signed in as
   SysAdmin.
2. **Create a project.** Go to **Settings -> Projects**, enter a name (`Acme Corp`) and a slug (`acme`),
   and click _Create project_. Projects are the workspaces that scope everything below, so you can run
   many assessments side by side.
3. **Add a target.** Go to **Targets**, pick the active project in the top-right switcher, enter a
   domain (`example.com`). Optionally paste predefined subdomains (this skips subfinder) and custom
   request headers (sent by httpx and nuclei).
4. **Run a scan.** Go to **Vulnerability Assessment**, click _New scan_, choose the target and a profile
   (Quick / Standard / Deep), and start it. The detail page streams live stage-by-stage progress and
   you can cancel at any time.
5. **Triage findings.** Open the finished scan. The Vulnerabilities tab lists findings with severity,
   CVSS/CVE, and a one-click _On Progress_ review toggle plus a full status dropdown. Use the status
   filter and _Mark all reviewed_ for bulk triage. Click _AI_ on a finding for an enriched
   description / impact / remediation (needs an AI key).
6. **Generate a report.** Click _Generate report_ to stream a branded bilingual PDF.
7. **Threat intelligence.** Go to **Threat Intel**, pick the project, and _Refresh_ to pull OTX
   reputation, leaked credentials, and sector security news. Choose your sector to filter the news,
   triage leaks and headlines, then generate the TI report.

---

## Using the platform

| Area                         | What you can do                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Vulnerability Assessment** | Start (active / passive / full mode), cancel, sub-scan, diff two scans, and AI-enriched findings triage.                                 |
| **Targets**                  | Add domains, predefined subdomains, and per-target custom request headers; recon notes.                                                  |
| **Attack Surface**           | Passive OSINT results: discovered URLs (file-category filter), exposure findings (masked snippet + triage), IP directory.                |
| **Cyber Threat Intel**       | OTX + LeakCheck + monitored-asset reputation (VT/OTX verdicts) + sector/brand news + passive exposure, all feeding one risk score.       |
| **Leaks**                    | Query breached-credential exposure for a domain or email, review hits, and save tracked cases.                                           |
| **Reports**                  | Branded EN/ID PDF for VA and TI, with signatories, classification, and executive summary.                                                |
| **Settings**                 | Projects, scheduled scans (cron), scan profiles, API tokens, webhooks, AI provider + key vault, users/RBAC, audit log.                   |

RBAC: **SysAdmin** (full control), **PenetrationTester** (run scans, modify findings),
**Auditor** (read-only). Enforced server-side on every mutation.

---

## API reference

Every endpoint is under `/api` and (except the three public ones) requires a Bearer **API token**.
Create a token under **Settings -> API tokens**. Interactive docs live at **`/api/docs`** (Redoc) and
the raw spec at `/api/openapi.json`.

```bash
export TOKEN=vct_xxx
export BASE=http://localhost:3100/api
auth=(-H "Authorization: Bearer $TOKEN")
json=(-H 'content-type: application/json')
```

### Public (no auth)

| Method | Path                | Purpose                         |
| ------ | ------------------- | ------------------------------- |
| GET    | `/api/health`       | Liveness probe                  |
| GET    | `/api/openapi.json` | OpenAPI 3 specification         |
| GET    | `/api/docs`         | Redoc interactive documentation |

### Authenticated

| Method | Path                               | Purpose                                                                      |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/whoami`                      | Current token's user                                                         |
| GET    | `/api/search?q=`                   | Universal search across resources                                            |
| GET    | `/api/targets`                     | List targets                                                                 |
| POST   | `/api/targets`                     | Create a target (`projectId`, `domain`, ...)                                 |
| GET    | `/api/profiles`                    | List scan profiles                                                           |
| POST   | `/api/profiles`                    | Create a scan profile                                                        |
| POST   | `/api/scans`                       | Start a scan (`targetId`, optional `profileId`, `mode`: active/passive/full) |
| GET    | `/api/scans`                       | List scans                                                                   |
| GET    | `/api/scans/:id`                   | Scan detail                                                                  |
| GET    | `/api/scans/:id/results`           | Subdomains, endpoints, ports, vulnerabilities                                |
| GET    | `/api/surface/urls?projectId=`     | Passively discovered URLs (optional `category`, paginated)                   |
| GET    | `/api/surface/findings?projectId=` | Exposure findings (optional `type`)                                          |
| GET    | `/api/surface/ips?projectId=`      | Passive-DNS IP resolutions                                                   |
| GET    | `/api/scans/:id/events`            | Live progress (Server-Sent Events)                                           |
| POST   | `/api/scans/:id/cancel`            | Request cancellation                                                         |
| GET    | `/api/scans/:id/diff?against=`     | Diff this scan against an earlier one (`against` = baseline scan id)         |
| GET    | `/api/schedules`                   | List scheduled scans                                                         |
| POST   | `/api/schedules`                   | Create a cron schedule                                                       |
| DELETE | `/api/schedules/:id`               | Delete a schedule                                                            |
| GET    | `/api/threat-intel`                | TI snapshot for a project (risk, OTX, leaks)                                 |
| POST   | `/api/threat-intel/refresh`        | Enqueue a TI refresh                                                         |
| GET    | `/api/indicators`                  | List manual indicators                                                       |
| POST   | `/api/indicators`                  | Add a manual indicator                                                       |
| DELETE | `/api/indicators/:id`              | Delete an indicator                                                          |
| POST   | `/api/vulnerabilities/:id/status`  | Set a vulnerability's triage status                                          |
| POST   | `/api/leaks/:id/status`            | Set a leaked-credential triage status                                        |
| POST   | `/api/leaks/:id/toggle`            | Toggle a leak's checked flag                                                 |
| GET    | `/api/webhooks`                    | List webhooks                                                                |
| POST   | `/api/webhooks`                    | Create a webhook                                                             |
| DELETE | `/api/webhooks/:id`                | Delete a webhook                                                             |
| POST   | `/api/webhooks/:id/test`           | Send a test notification                                                     |

### Example: scan a target end to end

```bash
# 1. Create a target in a project
curl -s "${auth[@]}" "${json[@]}" -XPOST "$BASE/targets" \
  -d '{"projectId":"<project-uuid>","domain":"example.com"}'

# 2. Start a scan (omit profileId to use the worker default)
curl -s "${auth[@]}" "${json[@]}" -XPOST "$BASE/scans" \
  -d '{"targetId":"<target-uuid>"}'

# 3. Watch progress (SSE) or poll results
curl -s "${auth[@]}" "$BASE/scans/<scan-id>/events"
curl -s "${auth[@]}" "$BASE/scans/<scan-id>/results"

# 4. Diff against an earlier scan
curl -s "${auth[@]}" "$BASE/scans/<scan-id>/diff?against=<older-scan-id>"
```

Errors use standard codes: `401` (missing/invalid token), `403` (RBAC denied), `404` (not found),
`400` (validation, with a Zod issue list).

---

## Reports

Reports are HTTP routes that stream a PDF (open them in the browser or `curl -o`):

```text
GET /reports/va/<scanId>?type=full&lang=id     # vulnerability assessment
GET /reports/ti/<projectId>?lang=en            # threat intelligence
```

`type` can be `full` or `summary`; `lang` is `en` or `id`. Branding (logo, colours, classification,
signatories, executive summary) is configured per project under Settings. Reports never use em dashes
and the layout follows a consistent reference design.

---

## Configuration

| Var                                    | Required | Purpose                                                             |
| -------------------------------------- | -------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                         | yes      | Postgres connection string                                          |
| `ENCRYPTION_KEY`                       | yes      | 32-byte base64, AES-256-GCM vault key                               |
| `POSTGRES_PASSWORD`                    | docker   | Postgres password for the compose stack (set a strong value)        |
| `OTX_API_KEY`, `LEAKCHECK_API_KEY`     | no       | threat-intel sources (degrade gracefully if unset)                  |
| `VT_API_KEY`, `URLSCAN_API_KEY`        | no       | VirusTotal + URLScan for passive recon (Wayback works without them) |
| `OPENAI_API_KEY` / `OLLAMA_BASE_URL`   | no       | AI provider (per-project / system-default keys override via vault)  |
| `PROXY_URL`                            | no       | Route worker outbound OSINT/deep-fetch through a proxy              |
| `SCHEDULE_TZ`                          | no       | Timezone for scan schedules + daily news (default `Asia/Jakarta`)   |
| `NEWS_RETENTION_DAYS`                  | no       | Auto-prune threat/brand news older than N days (default `90`)       |

Per-project keys set in the encrypted vault (Settings -> Integrations) take precedence over these
environment defaults.

### AI enrichment with a custom / compatible endpoint

By default the **OpenAI** provider talks to the official cloud API. You can point it at any
**OpenAI-compatible** endpoint instead - a local proxy, an internal gateway, or
[LiteLLM](https://github.com/BerriAI/litellm) - without touching the rest of your setup.

1. Open **Settings -> Integrations -> AI enrichment**.
2. Pick the **Provider** (OpenAI or Ollama) and the **Model** name your endpoint expects.
3. Set **Base URL** to your endpoint, e.g. `http://localhost:4000/v1` (LiteLLM) or your gateway's
   base path. Leave it **blank** to use the official cloud API.
4. Put the API key your endpoint expects in the **encrypted vault** (same page) for that provider -
   or in `OPENAI_API_KEY`. The Base URL only changes _where_ requests go; the key field is unchanged.
5. Save, then click **AI** on any finding to verify enrichment works against your endpoint.

Notes:

- The Base URL is **per project** and optional; it never affects other projects or your API keys.
- It must be a full `http(s)://` URL (invalid values are ignored and fall back to the cloud default).
- For a **fully local** model use the **Ollama** provider instead, configured via `OLLAMA_BASE_URL`
  (default `http://localhost:11434`).

---

## Testing and QA

Three tiers plus end-to-end (see [`docs/how-to/run-tests.md`](docs/how-to/run-tests.md)):

```bash
npm run test:quick        # unit (Vitest)
npm run test:integration  # integration (needs Postgres)
npm run e2e               # Playwright e2e (headless)
npm run e2e:ui            # Playwright UI mode (interactive, headed/desktop)
```

CI runs typecheck + lint + all three tiers behind a quality gate.

---

## Docker and deployment

```bash
make up      # app + worker + Postgres (migrations auto-run)
make down    # stop the stack
```

Designed to sit behind a **Cloudflare Tunnel** (no inbound ports). See
[`docs/how-to/deploy.md`](docs/how-to/deploy.md) and
[`docs/planning/03-API-AND-DEPLOY.md`](docs/planning/03-API-AND-DEPLOY.md).

---

## Project layout

```text
apps/        web (Next.js), worker (pg-boss)
libs/        @vacti/{core,config,db,auth,queue,ui,recon,threat-intel,reports,api,integrations}
docs/        Diataxis docs (tutorials/how-to/reference/explanation) + planning decision records
drizzle/     SQL migrations (0000+)
```

---

## Security and scope

Only scan **authorized** targets. Secrets live only in `.env` or the encrypted vault and are never
logged or committed. RBAC is enforced server-side on every mutation. See [`SECURITY.md`](SECURITY.md).
Out of scope for v1: bug-bounty sync, screenshots, heavy OSINT, multi-org, proxying.

---

## Documentation

- Product direction: [`ROADMAP.md`](ROADMAP.md)
- Tutorials and how-to guides: [`docs/`](docs/)
- Planning and decisions: [`docs/planning/`](docs/planning/)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License

Licensed under the **MIT License**. You may use, copy, modify, and distribute it, including in
proprietary and commercial work, provided the copyright notice and license text are retained. See
[`LICENSE`](LICENSE) for the full text and [`LICENSING-NOTICE.md`](LICENSING-NOTICE.md) for the
human-readable summary.
</content>
</invoke>
