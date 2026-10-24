#!/bin/bash
# backup.sh — SQLite hot backup for Outbound OS
# Run via cron: 0 2 * * * /home/user/outbound-os/scripts/backup.sh
# Keeps 7 daily backups automatically.

set -e
umask 077

REMOTE_DIR="${REMOTE_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"
# Defaults to the path in .env.example (DATABASE_URL=file:../data/outboundos.db,
# relative to prisma/). Set OUTBOUNDOS_DB_FILE if your database lives elsewhere.
if [ -n "${OUTBOUNDOS_DB_FILE:-}" ]; then
  DB_FILE="$OUTBOUNDOS_DB_FILE"
elif [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    file:/*) DB_FILE="${DATABASE_URL#file:}" ;;
    file:*) DB_FILE="$REMOTE_DIR/prisma/${DATABASE_URL#file:}" ;;
    *) echo "❌ Backup requires a file: SQLite DATABASE_URL" >&2; exit 1 ;;
  esac
else
  DB_FILE="$REMOTE_DIR/data/outboundos.db"
fi
BACKUP_DIR="${OUTBOUNDOS_BACKUP_DIR:-$REMOTE_DIR/data/backups}"
MAX_BACKUPS=7

if [ ! -s "$DB_FILE" ]; then
  echo "❌ Refusing backup: live database is missing or empty: $DB_FILE" >&2
  exit 1
fi
DB_FILE="$(realpath "$DB_FILE")"

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

# Retained email originals are encrypted, but they are still needed to replay
# held receipts. Preserve them alongside the database snapshot. Keep the
# instance encryption key in the operator's separate secret backup.
PRIVATE_MAIL_DIR="$(dirname "$DB_FILE")/private/inbound-email"
MAIL_BACKUP="${BACKUP_FILE%.db}.inbound-mail.tar.gz"
if [ -d "$PRIVATE_MAIL_DIR" ]; then
  if ! tar -czf "$MAIL_BACKUP.tmp" -C "$(dirname "$DB_FILE")" private/inbound-email; then
    rm -f "$MAIL_BACKUP.tmp"
    echo "❌ Private email backup failed; database snapshot exists but this backup set is incomplete" >&2
    exit 1
  fi
  mv "$MAIL_BACKUP.tmp" "$MAIL_BACKUP"
  echo "✅ Encrypted inbound originals included in backup set"
elif [ "$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='InboundEmailReceipt';")" = "1" ] \
  && [ "$(sqlite3 "$DB_FILE" "SELECT count(*) FROM InboundEmailReceipt WHERE rawPath IS NOT NULL;")" -gt 0 ]; then
  echo "❌ Backup set is incomplete: retained email receipts exist but their private originals directory is missing" >&2
  exit 1
fi

# Prune old backups — keep only the newest MAX_BACKUPS
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.db.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  while IFS= read -r old_backup; do
    rm -f "$old_backup" "${old_backup%.db.gz}.inbound-mail.tar.gz"
  done < <(ls -1t "$BACKUP_DIR"/*.db.gz | tail -n +$((MAX_BACKUPS + 1)))
  echo "🗑  Pruned old backups (kept $MAX_BACKUPS)"
fi

echo "📦 Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*.db.gz 2>/dev/null | awk '{print $5, $9}'
