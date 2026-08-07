#!/usr/bin/env bash
#
# vacti disaster-recovery restore. Fetches a restic snapshot and reconstructs the server state:
# the Postgres DB, the .data bind mounts, and the secrets/config.
#
# The DB dump and the .env (ENCRYPTION_KEY) are a matched pair - integration secrets are encrypted
# at rest in Postgres and are useless without the exact .env restored alongside. This script keeps
# them together.
#
# Usage:
#   restore.sh [SNAPSHOT] [--target DIR] [options]
#     SNAPSHOT        restic snapshot id or "latest" (default: latest)
#     --target DIR    where to fetch the snapshot (default: /restore)
#     --verify        run `restic check` on the repo and exit (no restore)
#     --dry-run       show what WOULD happen (lists snapshot + planned steps), change nothing
#     --apply         actually reconstruct the LIVE system (recreate DB, restore volumes/config).
#                     Without --apply the snapshot is fetched to DIR and the exact follow-up
#                     commands are printed for you to run/inspect (the safe default).
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

SNAPSHOT="latest"
TARGET="/restore"
DO_VERIFY=0
DRY_RUN=0
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --verify) DO_VERIFY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --apply) APPLY=1; shift ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --*) die "unknown option: $1" ;;
    *) SNAPSHOT="$1"; shift ;;
  esac
done

need_restic
load_backup_env

if [ "$DO_VERIFY" -eq 1 ]; then
  # A FULL `restic check --read-data` re-downloads the ENTIRE repo, which blows the Backblaze B2 free
  # daily DOWNLOAD cap (backups are upload-only and never count; only verify/restore download). So the
  # routine (weekly) verify reads only a rotating SUBSET of pack files - cheap, still catches bit-rot over
  # time. Set VERIFY_SUBSET to change the sample, or VERIFY_FULL=1 for a one-off full read (aware it
  # downloads everything). The per-backup `restic check` already samples 2% every run.
  if [ "${VERIFY_FULL:-0}" = "1" ]; then
    log "restic check --read-data (FULL - re-downloads the whole repo; counts against the B2 download cap)"
    restic check --read-data
  else
    log "restic check --read-data-subset=${VERIFY_SUBSET:-5%} (structure + rotating data sample; stays under the B2 daily cap)"
    restic check --read-data-subset="${VERIFY_SUBSET:-5%}"
  fi
  log "verify OK"
  exit 0
fi

log "target snapshot: $SNAPSHOT  fetch dir: $TARGET  apply=$APPLY dry_run=$DRY_RUN"
log "available snapshots:"
restic snapshots --tag nightly --compact 2>/dev/null || restic snapshots

if [ "$DRY_RUN" -eq 1 ]; then
  cat <<EOF

DRY-RUN - no changes made. A real restore would:
  1. restic restore $SNAPSHOT --target $TARGET
  2. read $TARGET/var/backups/vacti/MANIFEST-*.txt and clone the source at that git_sha
  3. extract $TARGET/var/backups/vacti/secrets-*.tar to /   (.env, backup.env)
  4. copy $TARGET/home/vacti/vacti/.data into place, chown 10001
  5. docker compose up -d db; wait healthy; pg_restore the newest vacti-db-*.dump into a clean db
  6. docker compose build && up -d
Run without --dry-run to fetch, and add --apply to reconstruct the live system.
EOF
  exit 0
fi

# --- Fetch the snapshot ------------------------------------------------------
mkdir -p "$TARGET"
log "restic restore $SNAPSHOT --target $TARGET"
restic restore "$SNAPSHOT" --target "$TARGET"

BK="$TARGET/var/backups/vacti"
[ -d "$BK" ] || die "restored tree has no $BK - wrong snapshot?"
MANIFEST="$(ls -1t "$BK"/MANIFEST-*.txt 2>/dev/null | head -1 || true)"
DUMP="$(ls -1t "$BK"/vacti-db-*.dump 2>/dev/null | head -1 || true)"
SECRETS="$(ls -1t "$BK"/secrets-*.tar 2>/dev/null | head -1 || true)"
[ -n "$DUMP" ]    || die "no vacti-db-*.dump found under $BK"
[ -n "$SECRETS" ] || die "no secrets-*.tar found under $BK"

log "restored snapshot contents:"
[ -n "$MANIFEST" ] && { log "--- manifest ---"; sed 's/^/    /' "$MANIFEST"; }
log "db dump:    $DUMP"
log "secrets:    $SECRETS"

if [ "$APPLY" -eq 0 ]; then
  cat <<EOF

Snapshot fetched to $TARGET. Not applied (no --apply). To reconstruct 1:1, run:

  # 1. Clone the source at the manifest SHA (skip if the tree already exists):
  git clone $(grep -m1 '^git_remote=' "${MANIFEST:-/dev/null}" 2>/dev/null | cut -d= -f2-) $VACTI_DIR
  git -C $VACTI_DIR checkout $(grep -m1 '^git_sha=' "${MANIFEST:-/dev/null}" 2>/dev/null | cut -d= -f2-)

  # 2. Restore secrets + server-local config (paths are relative to /):
  sudo tar -C / -xf $SECRETS
  sudo chmod 600 $VACTI_DIR/.env /etc/vacti/backup.env

  # 3. Restore the bind-mount data dir and fix ownership (container uid 10001):
  sudo mkdir -p $VACTI_DIR/.data
  sudo cp -a $TARGET$VACTI_DIR/.data/. $VACTI_DIR/.data/
  sudo chown -R 10001:10001 $VACTI_DIR/.data

  # 4. Bring up the DB only, then load the logical dump:
  (cd $VACTI_DIR && docker compose up -d db)
  DBC=\$(docker compose -f $COMPOSE_MAIN ps -q db)
  until docker exec "\$DBC" pg_isready -U $PG_USER; do sleep 2; done
  docker exec -i "\$DBC" pg_restore -U $PG_USER -d $PG_DB --clean --if-exists --no-owner --no-privileges < $DUMP

  # 5. Build + start the whole stack:
  (cd $VACTI_DIR && docker compose build && docker compose up -d)

Or re-run this command with --apply to have the script do steps 2-4 for you.
EOF
  exit 0
fi

# --- APPLY: reconstruct the live system --------------------------------------
log "APPLY: reconstructing live system from $SNAPSHOT"

log "extracting secrets/config tar to /"
tar -C / -xf "$SECRETS"
chmod 600 "$VACTI_DIR/.env" 2>/dev/null || true
chmod 600 /etc/vacti/backup.env 2>/dev/null || true

log "restoring .data bind mounts"
mkdir -p "$VACTI_DIR/.data"
if [ -d "$TARGET$VACTI_DIR/.data" ]; then
  cp -a "$TARGET$VACTI_DIR/.data/." "$VACTI_DIR/.data/"
fi
chown -R 10001:10001 "$VACTI_DIR/.data" || log "WARN: could not chown .data (run as root)"

log "starting db service and loading the dump"
( cd "$VACTI_DIR" && docker compose up -d db )
DBC="$(db_container)"
tries=0
until docker exec "$DBC" pg_isready -U "$PG_USER" >/dev/null 2>&1; do
  tries=$((tries+1)); [ "$tries" -gt 60 ] && die "db never became ready"; sleep 2
done
docker exec -i "$DBC" pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner --no-privileges < "$DUMP"
log "pg_restore complete"

cat <<EOF

APPLY complete for DB + data + config. Finish the stack manually:
  cd $VACTI_DIR
  docker compose build && docker compose up -d
Then verify: docker compose ps ; curl -sf http://127.0.0.1:3100 ; log in and check a scan's results.
EOF
log "restore --apply OK"
