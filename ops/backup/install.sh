#!/usr/bin/env bash
#
# One-time installer for the vacti backup system. Installs restic, lays the scripts down under
# /opt/vacti-backup, installs the systemd timers, and seeds /etc/vacti/backup.env from the example.
# Idempotent. Fail-closed: it will NOT enable the nightly timer until backup.env is really filled.
#
# Run as root:  sudo ./install.sh
#
set -Eeuo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="/opt/vacti-backup"
ETC_ENV="/etc/vacti/backup.env"

[ "$(id -u)" -eq 0 ] || { echo "install.sh must run as root (sudo ./install.sh)"; exit 1; }

echo "==> installing restic"
if command -v restic >/dev/null 2>&1; then
  echo "    restic already present: $(restic version)"
else
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y restic || echo "    apt install failed, will try the official binary"
  fi
  if ! command -v restic >/dev/null 2>&1; then
    echo "    installing the official restic binary"
    ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
    case "$ARCH" in amd64|x86_64) RARCH=amd64 ;; arm64|aarch64) RARCH=arm64 ;; *) RARCH=amd64 ;; esac
    VER="0.17.3"
    TMP="$(mktemp -d)"
    curl -fsSL -o "$TMP/restic.bz2" \
      "https://github.com/restic/restic/releases/download/v${VER}/restic_${VER}_linux_${RARCH}.bz2"
    bunzip2 "$TMP/restic.bz2"
    install -m 755 "$TMP/restic" /usr/local/bin/restic
    rm -rf "$TMP"
  fi
fi
restic version || { echo "restic install failed"; exit 1; }

echo "==> laying down scripts in $DEST"
install -d -m 700 "$DEST"
for f in backup.sh restore.sh deadman.sh alert.sh lib.sh excludes.txt; do
  install -m 700 "$SRC_DIR/$f" "$DEST/$f"
done
# lib.sh and excludes are data, not executables, but 700 in a 700 dir is harmless and keeps it root-only.

echo "==> creating staging + log locations"
install -d -m 700 /var/backups/vacti
install -d -m 755 /var/lib/vacti
touch /var/log/vacti-backup.log && chmod 640 /var/log/vacti-backup.log

echo "==> seeding $ETC_ENV"
install -d -m 755 /etc/vacti
if [ -f "$ETC_ENV" ]; then
  echo "    $ETC_ENV already exists - left untouched"
else
  install -m 600 "$SRC_DIR/backup.env.example" "$ETC_ENV"
  echo "    wrote $ETC_ENV from the example (mode 600) - FILL IN THE REAL CREDENTIALS"
fi

echo "==> installing systemd units"
install -m 644 "$SRC_DIR"/systemd/*.service "$SRC_DIR"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload

# Fail-closed enablement: only arm the timers if the env file is really filled (no placeholders).
env_filled() {
  # shellcheck disable=SC1090
  ( set -a; . "$ETC_ENV" 2>/dev/null; set +a
    [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-${RESTIC_PASSWORD_FILE:-}}" ] || exit 1
    printf '%s' "${RESTIC_REPOSITORY}${RESTIC_PASSWORD:-}${B2_ACCOUNT_ID:-}${AWS_ACCESS_KEY_ID:-}" \
      | grep -qiE 'CHANGEME|<[a-z]|REPLACE_ME' && exit 1 || exit 0 )
}

if env_filled; then
  echo "==> backup.env is filled - enabling timers"
  systemctl enable --now vacti-backup.timer
  systemctl enable --now vacti-backup-verify.timer
  systemctl enable --now vacti-backup-deadman.timer
  echo "    enabled: vacti-backup.timer, vacti-backup-verify.timer, vacti-backup-deadman.timer"
  echo "    run a first backup now with:  sudo $DEST/backup.sh"
else
  echo "==> backup.env NOT yet filled - timers installed but NOT enabled (fail-closed)."
  echo "    1. Edit $ETC_ENV with real B2/S3 creds + a restic password."
  echo "    2. Initialise the repo once:   sudo bash -c 'set -a; . $ETC_ENV; set +a; restic init'"
  echo "    3. Re-run this installer (or: systemctl enable --now vacti-backup.timer vacti-backup-verify.timer vacti-backup-deadman.timer)"
fi

echo "==> done"
