#!/usr/bin/env bash
# Supervised production web server — bare-metal/WSL equivalent of the Docker `app` service.
# The canonical production deployment is Docker Compose (docs/how-to/deploy.md), where the app
# service uses `restart: unless-stopped`; this script is the non-Docker equivalent for this host.
#
# IMPORTANT: this serves a PRECOMPILED production build via `next start` — NOT `next dev`. Dev mode
# recompiles every route per request and ships unminified JS, which made heavy pages (e.g.
# /scans/[id]) slow on the live domain. Build first (`next build apps/web`, or scripts/rebuild-app
# flow) into the dist dir this serves, then run this. Restarts with capped backoff so the site
# self-heals after a crash/host hiccup.
#
# Config is read from the environment (or a local, git-ignored .env) — never hard-code secrets here.
#   Required: DATABASE_URL, ENCRYPTION_KEY
#   Optional: PORT (default 3100), NEXT_DIST_DIR (default .next-prod), OTX_API_KEY, LEAKCHECK_API_KEY
# Usage: scripts/run-app.sh
set -u

cd "$(dirname "$0")/.."

# Load a local .env if present (so secrets stay out of the repo and out of this script).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[app] DATABASE_URL is not set — export it or add it to .env" >&2
  exit 1
fi

PORT="${PORT:-3100}"
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-prod}"
export NODE_ENV=production

# Stop the loop cleanly on Ctrl-C / SIGTERM (don't restart after an intentional stop).
trap 'echo "[app] stop signal received, exiting"; exit 0' INT TERM

backoff=2
while true; do
  echo "[app] starting next start :${PORT} (dist=${NEXT_DIST_DIR}) $(date -u +%FT%TZ)"
  npx next start apps/web -p "${PORT}"
  code=$?
  echo "[app] exited (code ${code}); restarting in ${backoff}s"
  sleep "${backoff}"
  if [ "${backoff}" -lt 30 ]; then
    backoff=$((backoff * 2))
  fi
done
