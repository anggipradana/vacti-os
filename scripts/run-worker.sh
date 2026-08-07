#!/usr/bin/env bash
# Supervised worker runner — for running the worker directly on a host (bare-metal / WSL dev).
# The canonical production deployment is Docker Compose (docs/how-to/deploy.md), where the worker
# service uses `restart: unless-stopped` for the same effect; this script is the non-Docker equivalent.
#
# The worker processes scans, threat-intel refreshes and the schedule tick. If it exits for any
# reason (crash, OOM, host hiccup) with nothing to restart it, in-flight scans get orphaned and sit
# in "running" forever. This wrapper restarts the worker automatically with capped backoff so jobs
# keep flowing; the worker's own startup reaper + live watchdog then clean up anything that stalled.
#
# Config is read from the environment (or a local, git-ignored .env) — never hard-code secrets here.
#   Required: DATABASE_URL, ENCRYPTION_KEY
#   Optional: OTX_API_KEY, LEAKCHECK_API_KEY, SCAN_MAX_RUNTIME_MS
# Usage: scripts/run-worker.sh
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
  echo "[supervisor] DATABASE_URL is not set — export it or add it to .env" >&2
  exit 1
fi

# Stop the loop cleanly on Ctrl-C / SIGTERM (don't restart after an intentional stop).
trap 'echo "[supervisor] stop signal received, exiting"; exit 0' INT TERM

backoff=2
while true; do
  echo "[supervisor] starting worker $(date -u +%FT%TZ)"
  npx tsx apps/worker/src/main.ts
  code=$?
  echo "[supervisor] worker exited (code ${code}); restarting in ${backoff}s"
  sleep "${backoff}"
  if [ "${backoff}" -lt 30 ]; then
    backoff=$((backoff * 2))
  fi
done
