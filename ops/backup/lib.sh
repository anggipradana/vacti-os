# shellcheck shell=bash
# Shared helpers for the vacti backup + restore scripts. Sourced, never executed.
# No secrets live here; the real credentials are in /etc/vacti/backup.env (mode 600, gitignored).

# --- Tunables (override via environment before sourcing) ---------------------
VACTI_DIR="${VACTI_DIR:-/opt/vacti}"
COMPOSE_MAIN="${COMPOSE_MAIN:-$VACTI_DIR/docker-compose.yml}"
VACTI_PROJECT="${VACTI_PROJECT:-vacti}"
BACKUP_ENV="${BACKUP_ENV:-/etc/vacti/backup.env}"
STAGE_DIR="${STAGE_DIR:-/var/backups/vacti}"
LOG_FILE="${LOG_FILE:-/var/log/vacti-backup.log}"
PG_USER="${PG_USER:-vacti}"
PG_DB="${PG_DB:-vacti}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "FATAL: $*" >&2; exit 1; }

# Load the operator-provided env file (B2/S3 keys + restic repo + password).
# Fail-closed: the file must exist, be readable, and not still contain placeholders.
load_backup_env() {
  [ -f "$BACKUP_ENV" ] || die "env file not found: $BACKUP_ENV (copy backup.env.example, fill it, chmod 600)"
  # shellcheck disable=SC1090
  set -a; . "$BACKUP_ENV"; set +a
  [ -n "${RESTIC_REPOSITORY:-}" ] || die "RESTIC_REPOSITORY is unset in $BACKUP_ENV"
  [ -n "${RESTIC_PASSWORD:-${RESTIC_PASSWORD_FILE:-}}" ] || die "RESTIC_PASSWORD (or RESTIC_PASSWORD_FILE) is unset in $BACKUP_ENV"
  if printf '%s' "${RESTIC_REPOSITORY}${RESTIC_PASSWORD:-}${B2_ACCOUNT_ID:-}${AWS_ACCESS_KEY_ID:-}" | grep -qiE 'CHANGEME|<[a-z]|REPLACE_ME'; then
    die "$BACKUP_ENV still contains placeholder values - fill in the real credentials first"
  fi
}

# restic must be on PATH. install.sh puts it there.
need_restic() {
  command -v restic >/dev/null 2>&1 || die "restic not installed - run install.sh (installs it) first"
}

# Resolve the running Postgres container id via compose (robust to project suffix).
db_container() {
  local cid
  cid="$(docker compose -f "$COMPOSE_MAIN" ps -q db 2>/dev/null || true)"
  [ -n "$cid" ] || die "db container not running (docker compose -f $COMPOSE_MAIN ps -q db returned nothing)"
  printf '%s' "$cid"
}

# Best-effort failure alert. Never fails the caller.
alert() {
  local msg="$1"
  [ -n "${ALERT_WEBHOOK:-}" ] || return 0
  curl -fsS -m 15 --data-urlencode "text=${msg}" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
}
