#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/amiraliie/wholesale-panel-clean.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/wholesale-panel}"
SERVICE_NAME="${SERVICE_NAME:-wholesale-panel-api}"
APP_PORT="${APP_PORT:-8080}"
API_PORT="${API_PORT:-4000}"

DB_NAME="${DB_NAME:-wholesale_panel}"
DB_USER="${DB_USER:-wholesale_user}"
DB_PASS="${DB_PASS:-}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root."
  exit 1
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

if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "Admin password is required."
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

DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="$(openssl rand -hex 32)"
COOKIE_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo
echo "Preparing PostgreSQL..."
sudo -u postgres psql <<SQL
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

echo
echo "Downloading project..."
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
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
printf "%s\n%s\n%s\n" "$ADMIN_USERNAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" | npm --prefix server run create-admin

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

    client_max_body_size 20m;

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
