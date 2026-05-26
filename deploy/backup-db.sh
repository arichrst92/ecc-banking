#!/usr/bin/env bash
# Backup PostgreSQL — jalanin via cron daily.
# Output: /var/backups/ecc-finance/ecc_finance-YYYYMMDD-HHMMSS.sql.gz
# Retention: 30 hari (auto-cleanup).
#
# Setup cron (sebagai user `ecc`):
#   crontab -e
#   0 2 * * * /var/www/ecc-finance/deploy/backup-db.sh >> /var/log/ecc-finance/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/var/backups/ecc-finance"
RETENTION_DAYS=30
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/ecc_finance-$TS.sql.gz"

mkdir -p "$BACKUP_DIR"

# Baca DATABASE_URL dari .env.local
if [ -f /var/www/ecc-finance/.env.local ]; then
  export $(grep DATABASE_URL /var/www/ecc-finance/.env.local | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[$(date -Iseconds)] ERROR: DATABASE_URL tidak ada"
  exit 1
fi

echo "[$(date -Iseconds)] Backup ke $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[$(date -Iseconds)] Success — $SIZE"

# Cleanup backup > retention
find "$BACKUP_DIR" -name "ecc_finance-*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date -Iseconds)] Cleanup backup > $RETENTION_DAYS hari done"

# Backup uploads folder juga (file mutasi raw)
UPLOAD_BAK="$BACKUP_DIR/uploads-$TS.tar.gz"
if [ -d /var/www/ecc-finance-uploads ]; then
  tar -czf "$UPLOAD_BAK" -C /var/www ecc-finance-uploads 2>/dev/null || true
  echo "[$(date -Iseconds)] Uploads backed up to $UPLOAD_BAK"
fi
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +$RETENTION_DAYS -delete
