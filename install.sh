#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/amiraliie/wholesale-panel-clean.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/wholesale-panel}"
SERVICE_NAME="${SERVICE_NAME:-wholesale-panel-api}"
APP_PORT="${APP_PORT:-8080}"
API_PORT="${API_PORT:-4000}"
MODE="${MODE:-auto}"

DB_NAME="${DB_NAME:-wholesale_panel}"
DB_USER="${DB_USER:-wholesale_user}"
DB_PASS="${DB_PASS:-}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root."
  exit 1
fi

cd /tmp

if [[ -f /etc/os-release ]]; then
  . /etc/os-release
else
  echo "Unsupported OS: /etc/os-release not found."
  exit 1
fi

case "${ID}:${VERSION_ID}" in
  ubuntu:22.04|ubuntu:24.04|debian:12)
    ;;
  *)
    echo "Unsupported OS: ${PRETTY_NAME:-unknown}"
    echo "Please use Ubuntu 22.04, Ubuntu 24.04, or Debian 12."
    exit 1
    ;;
esac


run_update() {
  echo
  echo "Existing installation detected at ${INSTALL_DIR}."
  echo "Update mode preserves database and existing .env files."

  if [[ ! -d "${INSTALL_DIR}/.git" || ! -f "${INSTALL_DIR}/server/.env" ]]; then
    echo "Existing installation is incomplete. Update aborted."
    exit 1
  fi

  if [[ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
    echo "Systemd service not found: ${SERVICE_NAME}.service"
    echo "Run a fresh installation first."
    exit 1
  fi

  echo
  echo "Installing system packages..."
  apt-get update
  apt-get install -y curl git ca-certificates gnupg nginx postgresql postgresql-contrib openssl

  systemctl enable --now postgresql

  if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
    echo "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="/root/wholesale-panel-backups"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  cp "${INSTALL_DIR}/server/.env" "${BACKUP_DIR}/server.env.${TIMESTAMP}" || true
  [[ -f "${INSTALL_DIR}/.env" ]] && cp "${INSTALL_DIR}/.env" "${BACKUP_DIR}/client.env.${TIMESTAMP}" || true

  DB_URL="$(grep -E '^DATABASE_URL=' "${INSTALL_DIR}/server/.env" | tail -1 | cut -d= -f2- || true)"
  if [[ -z "$DB_URL" ]]; then
    echo "DATABASE_URL not found in ${INSTALL_DIR}/server/.env. Update aborted."
    exit 1
  fi

  DB_BACKUP_FILE="${BACKUP_DIR}/before-update-${TIMESTAMP}.backup"
  echo
  echo "Creating database backup..."
  pg_dump --format=custom --no-owner --no-acl --dbname "$DB_URL" --file "$DB_BACKUP_FILE"

  echo
  echo "Updating project..."
  git config --global --add safe.directory "$INSTALL_DIR" >/dev/null 2>&1 || true
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"

  cd "$INSTALL_DIR"

  echo
  echo "Installing dependencies..."
  npm ci || npm install
  npm --prefix server ci || npm --prefix server install

  echo
  echo "Building project..."
  npm run build:client
  npm run build:server

  echo
  echo "Running database migrations..."
  npm --prefix server run db:migrate

  echo
  echo "Fixing ownership..."
  id -u wholesale-panel >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin wholesale-panel
  chown -R wholesale-panel:wholesale-panel "$INSTALL_DIR"

  echo
  echo "Restarting services..."
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"

  nginx -t
  systemctl reload nginx

  echo
  echo "Update completed."
  echo "Database backup: ${DB_BACKUP_FILE}"
  echo "Env backup dir: ${BACKUP_DIR}"
}

EXISTING_INSTALL=0
if [[ -d "$INSTALL_DIR/.git" && -f "$INSTALL_DIR/server/.env" ]]; then
  EXISTING_INSTALL=1
fi

if [[ "$MODE" == "update" && "$EXISTING_INSTALL" != "1" ]]; then
  echo "MODE=update requested, but no existing installation was found at ${INSTALL_DIR}."
  exit 1
fi

if [[ "$MODE" == "update" ]] || [[ "$MODE" == "auto" && "$EXISTING_INSTALL" == "1" ]]; then
  echo
  read -rp "Existing install found. Update in-place and preserve database/env? [Y/n]: " CONFIRM_UPDATE
  CONFIRM_UPDATE="${CONFIRM_UPDATE:-Y}"

  case "$CONFIRM_UPDATE" in
    y|Y|yes|YES)
      run_update
      exit 0
      ;;
    *)
      echo "Update cancelled."
      exit 1
      ;;
  esac
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"

echo
echo "Wholesale Panel Installer"
echo "-------------------------"

read -rp "Panel host/domain [$SERVER_IP]: " PANEL_HOST
PANEL_HOST="${PANEL_HOST:-$SERVER_IP}"

read -rp "Panel port [$APP_PORT]: " INPUT_APP_PORT
APP_PORT="${INPUT_APP_PORT:-$APP_PORT}"

read -rp "Admin username [admin]: " ADMIN_USERNAME
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"

read -rp "Admin email [admin@example.com]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

read -rsp "Admin password: " ADMIN_PASSWORD
echo

read -rsp "Existing ENCRYPTION_KEY for migration/restore (leave empty to generate): " INPUT_ENCRYPTION_KEY
echo

if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "Admin password is required."
  exit 1
fi

if (( ${#ADMIN_PASSWORD} <= 8 )) || [[ ! "$ADMIN_PASSWORD" =~ [A-Za-z] ]] || [[ ! "$ADMIN_PASSWORD" =~ [0-9] ]]; then
  echo "Admin password must be longer than 8 characters and include English letters and numbers."
  exit 1
fi

if [[ "$APP_PORT" == "80" ]]; then
  APP_URL="http://${PANEL_HOST}"
else
  APP_URL="http://${PANEL_HOST}:${APP_PORT}"
fi

echo
echo "Installing system packages..."
apt-get update
apt-get install -y curl git ca-certificates gnupg nginx postgresql postgresql-contrib openssl

systemctl enable --now postgresql

DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="$(openssl rand -hex 32)"
COOKIE_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="${INPUT_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo
echo "Preparing PostgreSQL..."
(
cd /tmp
sudo -u postgres psql -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
  ELSE
    ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
)

echo
echo "Downloading project..."
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

cat > .env <<ENV
VITE_API_BASE_URL=/api
VITE_APP_NAME="Wholesale Panel"
ENV

mkdir -p server

cat > server/.env <<ENV
NODE_ENV=production
PORT=${API_PORT}

APP_URL=${APP_URL}
API_URL=${APP_URL}/api
CORS_ORIGIN=${APP_URL}
SUBSCRIPTION_PUBLIC_URL=${APP_URL}/sub

DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECRET=${COOKIE_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

THREEXUI_TIMEOUT=30000
THREEXUI_RETRY_ATTEMPTS=2
BCRYPT_ROUNDS=12
ENV

echo
echo "Installing dependencies..."
npm ci || npm install
npm --prefix server ci || npm --prefix server install

echo
echo "Building project..."
npm run build:client
npm run build:server

echo
echo "Running database migrations..."
npm --prefix server run db:migrate

echo
echo "Creating admin user..."
ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm --prefix server run create-admin

echo
echo "Creating system user..."
id -u wholesale-panel >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin wholesale-panel
chown -R wholesale-panel:wholesale-panel "$INSTALL_DIR"

echo
echo "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=Wholesale Panel Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=wholesale-panel
WorkingDirectory=${INSTALL_DIR}/server
EnvironmentFile=${INSTALL_DIR}/server/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

echo
echo "Configuring Nginx..."
cat > /etc/nginx/sites-available/wholesale-panel <<NGINX
server {
    listen ${APP_PORT};
    server_name _;

    root ${INSTALL_DIR}/dist;
    index index.html;

    client_max_body_size 512m;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/wholesale-panel /etc/nginx/sites-enabled/wholesale-panel
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

nginx -t
systemctl reload nginx

cat > /root/wholesale-panel-install-info.txt <<INFO
APP_URL=${APP_URL}
API_URL=${APP_URL}/api
INSTALL_DIR=${INSTALL_DIR}
SERVICE_NAME=${SERVICE_NAME}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
INFO

chmod 600 /root/wholesale-panel-install-info.txt

echo
echo "Installation completed."
echo "Panel URL: ${APP_URL}"
echo "Admin username: ${ADMIN_USERNAME}"
echo
echo "Useful commands:"
echo "  systemctl status ${SERVICE_NAME} --no-pager -l"
echo "  journalctl -u ${SERVICE_NAME} -f --no-pager"
echo "  cat /root/wholesale-panel-install-info.txt"
