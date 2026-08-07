---
title: How to Set Up Your Development Environment
description: Install and configure the tools needed to develop, test, and contribute to vacti
category: how-to
tags:
  - onboarding
  - toolchain
  - setup
  - development
  - docker
created: 2026-04-04
---

# How to Set Up Your Development Environment

This guide installs everything you need to work on vacti locally. After completing it, the git
hooks, unit tests, integration tests, and E2E tests all run on your machine.

## Overview

vacti is an Nx monorepo of TypeScript projects (a Next.js app and a Node worker) backed by
PostgreSQL. Active scans additionally shell out to four Go scanners.

## Prerequisites

- **macOS** or **Linux** (Debian/Ubuntu recommended).
- **Admin access** to install system packages.
- **~5 GB disk space** for runtimes, Docker images, and Playwright browsers.

## Required tools

| Tool         | Version     | Purpose                                              |
| ------------ | ----------- | ---------------------------------------------------- |
| Node.js      | 22 or newer | the whole stack is TypeScript                        |
| PostgreSQL   | 16 or newer | application data + pg-boss job queue                 |
| Chromium     | via Playwright | PDF rendering and e2e                             |
| Go + scanners| latest      | `subfinder`, `httpx`, `naabu`, `nuclei` (active scans only) |
| Docker       | 24+ (optional) | run the full stack with `make up`                 |

## Quick start

```bash
# 1. Clone and install dependencies
git clone <repo-url> vacti && cd vacti
npm ci

# 2. Install the Playwright browser (PDF rendering + e2e)
npx playwright install chromium
# On Linux, also install system libs:
npx playwright install-deps

# 3. Configure environment
cp .env.example .env
openssl rand -base64 32   # paste into ENCRYPTION_KEY

# 4. Create and prepare the database
createuser vacti --pwprompt
createdb vacti -O vacti
# set DATABASE_URL=postgres://vacti:vacti@localhost:5432/vacti in .env
npm run db:migrate
npm run db:seed

# 5. Run the app and the worker (two terminals)
npx tsx apps/worker/src/main.ts
npx next dev apps/web -p 3100
```

Open <http://localhost:3100> and create the first admin. `make dev` runs the app and worker
together if you prefer a single command.

## Install the Go scanners (for real active scans)

The rest of the app runs without them, but active scans need the four ProjectDiscovery tools on
your `PATH`:

```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest   # needs libpcap-dev
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
nuclei -update-templates
# ensure $(go env GOPATH)/bin is on your PATH
```

## Run the stack in Docker (alternative)

If you have Docker, you can skip the local Node/Postgres setup and run everything in containers:

```bash
make up      # app + worker + Postgres (migrations auto-run)
make down    # stop the stack
```

See [How to Deploy vacti](./deploy.md) for the full container topology.

## Verify

```bash
npm run typecheck
npm run lint
npm run test:quick          # unit
npm run test:integration    # integration (needs Postgres)
npm run e2e                 # Playwright e2e
```

Git hooks (pre-commit and commit-message checks) are installed by `npm ci`. See
[How to Run Tests](./run-tests.md) for the test tiers and their Postgres requirements.

## Troubleshooting

### Docker "permission denied" on Linux

Add your user to the docker group, then log out and back in:

```bash
sudo usermod -aG docker $USER
```

### Postgres "port already in use"

Another service is using port 5432. Stop it or point `DATABASE_URL` at a different port.

### Playwright "browser not found"

Re-install the browser (and Linux system libs):

```bash
npx playwright install chromium
npx playwright install-deps
```

## Related

- [How to Deploy vacti](./deploy.md) - Docker Compose deployment topology.
- [How to Run Tests](./run-tests.md) - test tiers and Postgres requirements.
- [How to Run Nx Commands](./run-nx-commands.md) - common Nx workflows.
</content>
