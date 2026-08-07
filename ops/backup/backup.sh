#!/usr/bin/env bash
#
# vacti nightly offsite backup: stage a consistent Postgres dump + secrets + a version manifest,
# then push everything (plus the live .data bind mounts) to an encrypted, deduplicated restic
# repository on Backblaze B2 / S3 / R2. Idempotent, fail-closed, locked.
#
# Usage:
#   backup.sh                # full run: stage -> restic backup -> forget --prune -> check
#   backup.sh --stage-only   # stage the dump/tars/manifest only, skip restic (safe offline test)
#   backup.sh --dry-run      # stage, then `restic backup --dry-run` (touches the repo, needs creds)
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

MODE="full"
case "${1:-}" in
  --stage-only) MODE="stage-only" ;;
  --dry-run)    MODE="dry-run" ;;
  "")           MODE="full" ;;
  *)            die "unknown argument: $1 (use --stage-only or --dry-run)" ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EXCLUDES="$SCRIPT_DIR/excludes.txt"

# --- single-run lock (flock) so overlapping timers cannot corrupt a run -------
# Note: the 2>/dev/null is scoped inside the brace group so it does NOT become a permanent
# redirect for the whole script (a bare `exec ... 2>/dev/null` would silence all later stderr).
LOCK="/var/lock/vacti-backup.lock"
if ! { exec 9>"$LOCK"; } 2>/dev/null; then
  LOCK="${TMPDIR:-/tmp}/vacti-backup.lock"
  exec 9>"$LOCK"
fi
flock -n 9 || die "another backup run holds the lock ($LOCK) - aborting"

on_err() {
  local line=$1
  log "FAILED at line $line (mode=$MODE stamp=$STAMP)"
  alert "vacti backup FAILED: stamp=$STAMP line=$line host=$(hostname)"
}
trap 'on_err $LINENO' ERR

log "backup start mode=$MODE stamp=$STAMP"

# Credentials only needed once we actually talk to restic.
if [ "$MODE" != "stage-only" ]; then
  need_restic
  load_backup_env
fi

mkdir -p "$STAGE_DIR"
chmod 700 "$STAGE_DIR"
umask 077

DBC="$(db_container)"

# 1. Logical Postgres dump, custom format (compressed, restorable table-by-table). MVCC gives a
#    consistent snapshot with zero downtime; portable across postgres:16 patch releases.
DUMP="$STAGE_DIR/vacti-db-$STAMP.dump"
log "pg_dump -> $DUMP"
docker exec -i "$DBC" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner --no-privileges > "$DUMP"
# Integrity gate: a valid custom-format dump lists its TOC; a truncated one does not. Never ship junk.
docker exec -i "$DBC" pg_restore -l < "$DUMP" >/dev/null || die "pg_dump produced an unreadable dump - aborting"
log "pg_dump ok ($(du -h "$DUMP" | cut -f1))"

# 1b. Roles/globals (passwords, roles) so a bare-metal cluster can be reconstructed.
GLOBALS="$STAGE_DIR/vacti-globals-$STAMP.sql"
docker exec -i "$DBC" pg_dumpall -U "$PG_USER" --globals-only > "$GLOBALS" || log "WARN: pg_dumpall globals failed (non-fatal)"

# 2. Secrets + server-local config bundle (tiny). Encrypted only by restic; staged mode 600.
#    tar'd with leading paths from / so restore extracts back to the exact same locations.
SECRETS="$STAGE_DIR/secrets-$STAMP.tar"
SECRET_PATHS=()
for p in \
  "home/vacti/vacti/.env" \
  "etc/vacti/backup.env"; do
  [ -e "/$p" ] && SECRET_PATHS+=("$p")
done
[ "${#SECRET_PATHS[@]}" -gt 0 ] || die "no secret/config files found to stage - refusing an empty backup"
tar -C / -cf "$SECRETS" "${SECRET_PATHS[@]}"
log "secrets tar ok (${#SECRET_PATHS[@]} files)"

# 3. Version manifest for a byte-for-byte rebuild.
MANIFEST="$STAGE_DIR/MANIFEST-$STAMP.txt"
{
  echo "backup_utc=$STAMP"
  echo "hostname=$(hostname)"
  echo "git_remote=$(git -C "$VACTI_DIR" remote get-url origin 2>/dev/null || echo unknown)"
  echo "git_sha=$(git -C "$VACTI_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "git_branch=$(git -C "$VACTI_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "git_dirty_files=$(git -C "$VACTI_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "docker_app_image=$(docker inspect -f '{{.Config.Image}}' "$(docker compose -f "$COMPOSE_MAIN" ps -q app 2>/dev/null)" 2>/dev/null || echo unknown)"
  echo "restic_version=$(command -v restic >/dev/null 2>&1 && restic version || echo not-installed)"
} > "$MANIFEST"
log "manifest written"

if [ "$MODE" = "stage-only" ]; then
  log "stage-only complete. Staged files:"
  ls -lh "$STAGE_DIR" | sed 's/^/    /'
  log "backup (stage-only) OK $STAMP"
  exit 0
fi

# 5. One restic backup of the stage + the live bind-mount data dirs.
DRYFLAG=()
[ "$MODE" = "dry-run" ] && DRYFLAG=(--dry-run)
log "restic backup -> $RESTIC_REPOSITORY ${DRYFLAG[*]:-}"
BACKUP_TARGETS=("$STAGE_DIR")
# Live .data bind mounts (report artifacts and any other persisted app data).
[ -d "$VACTI_DIR/.data" ] && BACKUP_TARGETS+=("$VACTI_DIR/.data")
restic backup "${DRYFLAG[@]}" \
  "${BACKUP_TARGETS[@]}" \
  --exclude-file "$EXCLUDES" \
  --tag nightly --host "${VACTI_PROJECT}-prod"

if [ "$MODE" = "dry-run" ]; then
  log "dry-run complete (no retention/prune, no data written)"
  exit 0
fi

# 6. Retention: prune unreferenced chunks after keeping the configured windows.
log "restic forget --prune (daily=$KEEP_DAILY weekly=$KEEP_WEEKLY monthly=$KEEP_MONTHLY)"
restic forget --tag nightly \
  --keep-daily "${KEEP_DAILY:-7}" \
  --keep-weekly "${KEEP_WEEKLY:-4}" \
  --keep-monthly "${KEEP_MONTHLY:-6}" \
  --prune

# 7. Cheap integrity check every run (a deep --read-data runs weekly via its own timer).
log "restic check (structure + 2% data sample)"
restic check --read-data-subset=2%

# 8. Trim the local stage; keep the two newest days for fast local rollback.
find "$STAGE_DIR" -type f ! -newermt '-2 days' -delete 2>/dev/null || true

log "backup OK $STAMP"
