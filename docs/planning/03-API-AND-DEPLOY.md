# vacti - API-First & Deployment (Cloudflare Tunnel)

## API-first (mandatory)

Every operation in vacti is exposed via a typed **REST API** from the start - not as an
afterthought. This makes the platform easy to test, script, and integrate with other tools.

- Auth: **Bearer API token** (`vct_…`, created in Settings, shown once). Session auth is for the
  web UI; tokens are for automation/CI/external tools.
- Surface lives in `@vacti/api` (Hono), mounted by the web app at `/api`:
  - `GET /api/health` (public), `GET /api/whoami`
  - `GET|POST /api/targets`, `GET|POST /api/profiles`
  - `POST /api/scans` (enqueue), `GET /api/scans`, `GET /api/scans/:id`,
    `GET /api/scans/:id/results`, `GET /api/scans/:id/events` (SSE progress)
  - Threat-intel, reports, and settings endpoints land with their epics.
- **OpenAPI** auto-generation + Redoc/Swagger UI is delivered in the api-and-integrations epic
  (task 001); the route shapes above are stable and Zod-validated today.
- Rule: a new resource/operation ships with its REST endpoint in the same change.

## Deployment - Cloudflare Tunnel (`cloudflared`)

vacti is self-hosted as three **containerised** services (`app` + `worker` + `db`) via Docker
Compose - nothing vacti-specific runs on the host. The `worker` image is self-contained (pinned
subfinder/httpx/naabu/nuclei + nuclei-templates + Chromium). Public exposure is via a **Cloudflare
Tunnel** - the only host-side, non-vacti piece - which just forwards to the app's published port.

Steps:

1. `docker compose up --build -d` (db + self-contained worker + app; app published on host `:3100`).
2. Install `cloudflared` and authenticate (`cloudflared tunnel login`).
3. Create a tunnel and route the domain to `http://localhost:3100`.
4. Set `app` env to the public origin once the domain is live; cookies use `Secure` in production.

```bash
cloudflared tunnel create vacti
cloudflared tunnel route dns vacti vacti.example.com
cloudflared tunnel run --url http://localhost:3100 vacti
# …or run cloudflared as a compose sidecar with a TUNNEL_TOKEN
```

> Cloudflare terminates TLS at the edge, so vacti itself needs no certificates - keeping the
> footprint minimal (no Nginx/TLS layer), consistent with the lightweight goal.
>
> Bare-metal (host PATH tools + `scripts/run-*.sh` supervisors) is a documented **fallback** only
> for hosts without a Docker engine - see [deploy.md](../how-to/deploy.md).
