#!/usr/bin/env bash
#
# Dead-man check: absence of a failure is not proof of success. Asserts the newest restic snapshot
# is younger than MAX_AGE_HOURS (default 26h) and alerts if the timer silently stopped producing.
#
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"
need_restic
load_backup_env

MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
JSON="$(restic snapshots --tag nightly --latest 1 --json 2>/dev/null || echo '[]')"

AGE_OK=1
if command -v python3 >/dev/null 2>&1; then
  AGE_OK="$(printf '%s' "$JSON" | python3 -c '
import sys, json, datetime
try:
    s = json.load(sys.stdin)
    if not s:
        print(0); sys.exit()
    t = s[-1]["time"][:19]
    dt = datetime.datetime.fromisoformat(t)
    age_h = (datetime.datetime.utcnow() - dt).total_seconds()/3600
    print(1 if age_h < float("'"$MAX_AGE_HOURS"'") else 0)
except Exception:
    print(0)
')"
else
  # No python: fall back to a coarse "is there any snapshot at all" check.
  printf '%s' "$JSON" | grep -q '"time"' && AGE_OK=1 || AGE_OK=0
fi

if [ "$AGE_OK" != "1" ]; then
  MSG="vacti backup DEAD-MAN: newest snapshot is older than ${MAX_AGE_HOURS}h (or none exists) - the nightly timer may have stopped. host=$(hostname)"
  log "$MSG"
  alert "$MSG"
  exit 1
fi
log "dead-man OK: a snapshot exists within ${MAX_AGE_HOURS}h"
