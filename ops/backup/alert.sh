#!/usr/bin/env bash
#
# Failure notifier fired by the systemd OnFailure= hook. Posts a short message to ALERT_WEBHOOK
# (if set in /etc/vacti/backup.env) and always drops a marker file the app/ops can surface.
# Never fails hard - alerting must not itself page.
#
set -uo pipefail
BACKUP_ENV="${BACKUP_ENV:-/etc/vacti/backup.env}"
UNIT="${1:-vacti-backup}"
MSG="vacti backup ALERT: unit=${UNIT} host=$(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ) - check /var/log/vacti-backup.log"

# Marker file: a dead-man / dashboard signal even when no webhook is configured.
mkdir -p /var/lib/vacti 2>/dev/null || true
printf '%s\n' "$MSG" > /var/lib/vacti/backup-last-failure 2>/dev/null || true

if [ -f "$BACKUP_ENV" ]; then
  # shellcheck disable=SC1090
  set -a; . "$BACKUP_ENV" 2>/dev/null; set +a
fi
if [ -n "${ALERT_WEBHOOK:-}" ]; then
  curl -fsS -m 15 --data-urlencode "text=${MSG}" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
fi
printf '%s\n' "$MSG"
exit 0
