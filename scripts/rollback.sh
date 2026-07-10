#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/wholesale-panel}"
SERVICE_NAME="${SERVICE_NAME:-wholesale-panel-api}"
BACKUP_DIR="${BACKUP_DIR:-/root/wholesale-panel-backups}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root."
  exit 1
fi

if [[ -z "${DB_BACKUP_FILE:-}" ]]; then
  echo "Usage:"
  echo "  DB_BACKUP_FILE=/root/wholesale-panel-backups/before-update-YYYYMMDD-HHMMSS.backup bash scripts/rollback.sh"
  echo
  echo "Available backups:"
  ls -lh "$BACKUP_DIR"/*.backup 2>/dev/null || true
  exit 1
fi

if [[ ! -f "$DB_BACKUP_FILE" ]]; then
  echo "Backup file not found: $DB_BACKUP_FILE"
  exit 1
fi

if [[ ! -f "$INSTALL_DIR/server/.env" ]]; then
  echo "Missing server env: $INSTALL_DIR/server/.env"
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$INSTALL_DIR/server/.env" | tail -1 | cut -d= -f2-)"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL missing in $INSTALL_DIR/server/.env"
  exit 1
fi

echo "Rollback target backup:"
echo "$DB_BACKUP_FILE"
echo
read -rp "This will restore the database from backup. Continue? [y/N]: " CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *)
    echo "Rollback cancelled."
    exit 1
    ;;
esac

TS="$(date +%Y%m%d-%H%M%S)"
SAFETY_BACKUP="/root/wholesale-panel-backups/before-rollback-${TS}.backup"
mkdir -p /root/wholesale-panel-backups
chmod 700 /root/wholesale-panel-backups

echo
echo "Creating safety backup before rollback..."
pg_dump --format=custom --no-owner --no-acl --dbname "$DATABASE_URL" --file "$SAFETY_BACKUP"

echo
echo "Validating rollback backup..."
pg_restore --list "$DB_BACKUP_FILE" >/dev/null

echo
echo "Stopping service..."
systemctl stop "$SERVICE_NAME" || true

echo
echo "Restoring database..."
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" "$DB_BACKUP_FILE"

echo
echo "Restarting service..."
systemctl start "$SERVICE_NAME"

echo
echo "Waiting for API..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4000/api/health" >/dev/null 2>&1; then
    echo "Rollback completed successfully."
    echo "Safety backup: $SAFETY_BACKUP"
    exit 0
  fi
  sleep 1
done

echo "Rollback restored DB, but API health failed."
systemctl status "$SERVICE_NAME" --no-pager -l || true
journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
exit 1
