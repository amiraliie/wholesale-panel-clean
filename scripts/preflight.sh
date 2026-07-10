#!/usr/bin/env bash
set -uo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/wholesale-panel}"
SERVICE_NAME="${SERVICE_NAME:-wholesale-panel-api}"
API_PORT="${API_PORT:-4000}"
MIN_DISK_MB="${MIN_DISK_MB:-1024}"
MIN_RAM_MB="${MIN_RAM_MB:-512}"

FAILED=0
WARNED=0

pass() { echo "✅ $*"; }
fail() { echo "❌ $*"; FAILED=$((FAILED + 1)); }
warn() { echo "⚠️  $*"; WARNED=$((WARNED + 1)); }
info() { echo "ℹ️  $*"; }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command found: $1"
  else
    fail "missing command: $1"
  fi
}

echo
echo "Wholesale Panel Production Preflight"
echo "------------------------------------"
echo "INSTALL_DIR=${INSTALL_DIR}"
echo "SERVICE_NAME=${SERVICE_NAME}"
echo "API_PORT=${API_PORT}"
echo

if [[ "${EUID}" -ne 0 ]]; then
  warn "not running as root; some checks may fail"
else
  pass "running as root"
fi

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_KEY="${ID:-unknown}:${VERSION_ID:-unknown}"
  case "$OS_KEY" in
    ubuntu:22.04|ubuntu:24.04|debian:12)
      pass "supported OS: ${PRETTY_NAME:-$OS_KEY}"
      ;;
    *)
      warn "untested OS: ${PRETTY_NAME:-$OS_KEY}"
      ;;
  esac
else
  fail "cannot read /etc/os-release"
fi

echo
echo "System commands"
echo "---------------"
for cmd in curl git node npm nginx psql pg_dump pg_restore systemctl df awk grep sed; do
  require_cmd "$cmd"
done

echo
echo "Node.js"
echo "-------"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 20 )); then
  pass "Node.js version: $(node -v)"
else
  fail "Node.js must be >= 20; current: $(node -v 2>/dev/null || echo missing)"
fi

echo
echo "Resources"
echo "---------"
DISK_TARGET="$INSTALL_DIR"
[[ -d "$DISK_TARGET" ]] || DISK_TARGET="/"
AVAIL_KB="$(df -Pk "$DISK_TARGET" | awk 'NR==2 {print $4}')"
AVAIL_MB=$((AVAIL_KB / 1024))
if (( AVAIL_MB >= MIN_DISK_MB )); then
  pass "disk available on ${DISK_TARGET}: ${AVAIL_MB} MB"
else
  fail "low disk space on ${DISK_TARGET}: ${AVAIL_MB} MB available, need >= ${MIN_DISK_MB} MB"
fi

RAM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if (( RAM_MB >= MIN_RAM_MB )); then
  pass "RAM total: ${RAM_MB} MB"
else
  warn "low RAM: ${RAM_MB} MB, recommended >= ${MIN_RAM_MB} MB"
fi

echo
echo "Installation files"
echo "------------------"
if [[ -d "$INSTALL_DIR" ]]; then
  pass "install dir exists"
else
  fail "install dir missing: $INSTALL_DIR"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  pass "git repo exists"
else
  warn "git repo missing in install dir"
fi

SERVER_ENV="$INSTALL_DIR/server/.env"
CLIENT_ENV="$INSTALL_DIR/.env"

if [[ -f "$SERVER_ENV" ]]; then
  pass "server .env exists"
else
  fail "server .env missing: $SERVER_ENV"
fi

if [[ -f "$CLIENT_ENV" ]]; then
  pass "client .env exists"
else
  warn "client .env missing: $CLIENT_ENV"
fi

DATABASE_URL=""
if [[ -f "$SERVER_ENV" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$SERVER_ENV" | tail -1 | cut -d= -f2- || true)"
  ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' "$SERVER_ENV" | tail -1 | cut -d= -f2- || true)"
  JWT_SECRET="$(grep -E '^JWT_SECRET=' "$SERVER_ENV" | tail -1 | cut -d= -f2- || true)"
  COOKIE_SECRET="$(grep -E '^COOKIE_SECRET=' "$SERVER_ENV" | tail -1 | cut -d= -f2- || true)"

  [[ -n "$DATABASE_URL" ]] && pass "DATABASE_URL exists" || fail "DATABASE_URL missing"
  [[ -n "$ENCRYPTION_KEY" ]] && pass "ENCRYPTION_KEY exists" || fail "ENCRYPTION_KEY missing"
  [[ -n "$JWT_SECRET" ]] && pass "JWT_SECRET exists" || fail "JWT_SECRET missing"
  [[ -n "$COOKIE_SECRET" ]] && pass "COOKIE_SECRET exists" || fail "COOKIE_SECRET missing"
fi

echo
echo "Services"
echo "--------"
if systemctl list-unit-files "${SERVICE_NAME}.service" --no-pager --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
  pass "systemd service exists: ${SERVICE_NAME}.service"
else
  fail "systemd service missing: ${SERVICE_NAME}.service"
fi

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  pass "service is active: $SERVICE_NAME"
else
  warn "service is not active: $SERVICE_NAME"
fi

if systemctl is-active --quiet postgresql 2>/dev/null; then
  pass "postgresql is active"
else
  fail "postgresql is not active"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  pass "nginx is active"
else
  warn "nginx is not active"
fi

echo
echo "Nginx"
echo "-----"
if nginx -t >/tmp/wholesale-preflight-nginx.log 2>&1; then
  pass "nginx config test passed"
else
  fail "nginx config test failed"
  cat /tmp/wholesale-preflight-nginx.log || true
fi
rm -f /tmp/wholesale-preflight-nginx.log

echo
echo "API health"
echo "----------"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/tmp/wholesale-preflight-health.json 2>/dev/null; then
    pass "API health check passed"
  else
    fail "API health check failed"
  fi
  rm -f /tmp/wholesale-preflight-health.json
else
  warn "API health check skipped because service is not active"
fi

echo
echo "Database backup test"
echo "--------------------"
if [[ -n "$DATABASE_URL" ]]; then
  TMP_BACKUP="$(mktemp /tmp/wholesale-preflight-db.XXXXXX.backup)"
  if pg_dump --format=custom --no-owner --no-acl --dbname "$DATABASE_URL" --file "$TMP_BACKUP" >/tmp/wholesale-preflight-pgdump.log 2>&1; then
    if pg_restore --list "$TMP_BACKUP" >/dev/null 2>&1; then
      pass "pg_dump backup test passed"
    else
      fail "pg_restore validation failed"
    fi
  else
    fail "pg_dump backup test failed"
    cat /tmp/wholesale-preflight-pgdump.log || true
  fi
  rm -f "$TMP_BACKUP" /tmp/wholesale-preflight-pgdump.log
else
  fail "database backup test skipped: DATABASE_URL missing"
fi

echo
echo "Summary"
echo "-------"
echo "Failures: $FAILED"
echo "Warnings: $WARNED"

if (( FAILED > 0 )); then
  echo "Preflight failed."
  exit 1
fi

echo "Preflight passed."
exit 0
