#!/bin/bash
# backup.sh — SQLite hot backup for Outbound OS
# Run via cron: 0 2 * * * /home/user/outbound-os/scripts/backup.sh
# Keeps 7 daily backups automatically.

set -e

REMOTE_DIR="${REMOTE_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"
# Defaults to the path in .env.example (DATABASE_URL=file:../data/outboundos.db,
# relative to prisma/). Set OUTBOUNDOS_DB_FILE if your database lives elsewhere.
DB_FILE="${OUTBOUNDOS_DB_FILE:-$REMOTE_DIR/data/outboundos.db}"
BACKUP_DIR="${OUTBOUNDOS_BACKUP_DIR:-$REMOTE_DIR/data/backups}"
MAX_BACKUPS=7

if [ ! -s "$DB_FILE" ]; then
  echo "❌ Refusing backup: live database is missing or empty: $DB_FILE" >&2
  exit 1
fi

INTEGRITY=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  echo "❌ Refusing backup: source database integrity check failed: $INTEGRITY" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/outbound-os_$TIMESTAMP.db"

# SQLite online backup (safe while DB is running — uses WAL snapshot)
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

BACKUP_INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")
if [ "$BACKUP_INTEGRITY" != "ok" ]; then
  echo "❌ Backup integrity check failed: $BACKUP_INTEGRITY" >&2
  exit 1
fi

# Compress
gzip "$BACKUP_FILE"
echo "✅ Backup created: ${BACKUP_FILE}.gz ($(du -sh "${BACKUP_FILE}.gz" | cut -f1))"

# Prune old backups — keep only the newest MAX_BACKUPS
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.db.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  ls -1t "$BACKUP_DIR"/*.db.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
  echo "🗑  Pruned old backups (kept $MAX_BACKUPS)"
fi

echo "📦 Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*.db.gz 2>/dev/null | awk '{print $5, $9}'
