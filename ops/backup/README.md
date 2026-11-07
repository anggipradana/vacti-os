# vacti offsite backup + restore

Encrypted, deduplicated, incremental offsite backup of the whole vacti control-plane state using
[restic](https://restic.net) to a Backblaze B2 (or any S3/R2-compatible) bucket, plus a tested 1:1
restore.

## What is in this directory

| File | Purpose |
|------|---------|
| `backup.sh` | Nightly job: stage pg_dump + secrets + manifest, `restic backup`, `forget --prune`, `check`. Locked, fail-closed. |
| `restore.sh` | 1:1 restore of a snapshot (DB, `.data` mounts, config). Supports `--dry-run`, `--verify`, `--apply`. |
| `deadman.sh` | Alerts if the newest snapshot is stale (silent-timer detector). |
| `alert.sh` | Failure notifier fired by the systemd `OnFailure=` hook. |
| `lib.sh` | Shared helpers (no secrets). |
| `excludes.txt` | restic `--exclude-file`. |
| `backup.env.example` | Documents the required credentials/knobs. The real file is `/etc/vacti/backup.env` (mode 600, NEVER committed). |
| `install.sh` | Installs restic + scripts (`/opt/vacti-backup`) + systemd timers. Won't arm the timer until `backup.env` is filled. |
| `systemd/*` | `vacti-backup` (daily 03:15), `vacti-backup-verify` (Sun 04:30 deep read), `vacti-backup-deadman` (daily 06:00), `vacti-backup-alert` (OnFailure). |

## What gets backed up (a true 1:1 server state)

- Postgres: logical `pg_dump -Fc` of the `vacti` DB (custom format, zero-downtime MVCC snapshot) plus
  `pg_dumpall --globals-only` for roles. Integrity-gated with `pg_restore -l` before it ships.
- `.data` bind mount: any persisted app data (e.g. report artifacts).
- Secrets/config, tar'd with paths from `/`: `${VACTI_DIR:-/opt/vacti}/.env` (holds `ENCRYPTION_KEY` +
  `POSTGRES_PASSWORD`) and `/etc/vacti/backup.env`.
- A version `MANIFEST` (git remote/SHA/branch, app image, restic version).

Not backed up (rebuildable): `node_modules`, `.next`, docker images, `/tmp`, and the source tree
(cloned from git at the manifest SHA).

### The one critical invariant

Integration secrets are encrypted at rest in Postgres, keyed by `ENCRYPTION_KEY` in `.env`. A DB dump
ALONE is useless - the restore MUST pair the dump with the exact `.env`. Both are in the backup, both
are required. Guard the restic password accordingly.

## Operator setup (one time)

1. Create a Backblaze B2 bucket, e.g. `vacti-backup-<random-suffix>`. Recommended: enable Object Lock
   (compliance mode, retention >= your longest keep, ~200 days) for a ransomware-proof,
   immutable history.
2. Create a B2 application key SCOPED to only that bucket (read+write+list). Never reuse the evidence
   R2 keys. (For R2/S3 instead: a separate bucket + a scoped token; set the `s3:` repo + AWS_* vars.)
3. On the box, install and seed config:
   ```bash
   sudo ${VACTI_DIR:-/opt/vacti}/ops/backup/install.sh
   ```
   This installs restic + the scripts to `/opt/vacti-backup`, installs the timers, and writes
   `/etc/vacti/backup.env` from the example (mode 600) if absent. It will NOT enable the timer yet.
4. Fill `/etc/vacti/backup.env` with the real `RESTIC_REPOSITORY`, a strong `RESTIC_PASSWORD`
   (`openssl rand -base64 48`), and the B2/S3 keys. Store `RESTIC_PASSWORD` in the operator password
   manager too - losing it makes the backup unrecoverable by design.
5. Initialise the repo once:
   ```bash
   sudo bash -c 'set -a; . /etc/vacti/backup.env; set +a; restic init'
   ```
6. Re-run `sudo /opt/vacti-backup/install.sh` (now that env is filled it arms the timers), then take a
   first backup:
   ```bash
   sudo /opt/vacti-backup/backup.sh
   ```
7. Confirm: `sudo restic snapshots` shows a `nightly` snapshot; `systemctl list-timers 'vacti-backup*'`
   shows the next run.

## Restore (stand up a 1:1 vacti on a fresh box)

Carry off-box (password manager): the contents of `/etc/vacti/backup.env`.

```bash
# 0. Fresh host: install docker + docker compose + git; create user `vacti`; put backup.env at
#    /etc/vacti/backup.env; install restic (or run this repo's install.sh which does it).

# 1. Inspect / verify (optional but recommended):
/opt/vacti-backup/restore.sh --verify          # restic check --read-data
/opt/vacti-backup/restore.sh latest --dry-run  # show the plan, change nothing

# 2. Fetch latest into /restore and print the exact follow-up commands (no live changes):
/opt/vacti-backup/restore.sh latest --target /restore

# 3. Reconstruct the live system automatically (DB + .data + config):
sudo /opt/vacti-backup/restore.sh latest --target /restore --apply
#    then finish, as the script prints:
cd ${VACTI_DIR:-/opt/vacti}
docker compose build && docker compose up -d
```

Verify: `docker compose ps` healthy; `curl -sf http://127.0.0.1:3100`; log in and confirm a scan's
results load (proves the DB restored AND `ENCRYPTION_KEY` still decrypts stored integration keys);
Settings shows integrations intact.

## Schedule + retention

- Daily 03:15 Asia/Jakarta (`vacti-backup.timer`, `Persistent=true`, jittered 5 min).
- Retention: `--keep-daily 7 --keep-weekly 4 --keep-monthly 6` then `--prune` (tunable in backup.env).
- Weekly deep verify Sunday 04:30 (`restic check --read-data`).
- Daily dead-man 06:00 alerts if the newest snapshot is older than 26h.
- Failures fire `vacti-backup-alert.service` (posts to `ALERT_WEBHOOK` if set, always writes
  `/var/lib/vacti/backup-last-failure`).

## Testing without touching a real bucket

- `bash -n` / shellcheck all scripts.
- `sudo STAGE_DIR=/tmp/bk ops/backup/backup.sh --stage-only` produces a real pg_dump + tars + manifest
  and skips restic entirely (safe offline).
- `restore.sh --dry-run` prints the plan with no repo access beyond listing.

RPO = 24h, RTO target = 2h.
