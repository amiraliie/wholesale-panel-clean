# Wholesale Panel

A production-ready wholesale VPN management panel for 3x-ui / Xray businesses.

## Features

- Admin dashboard
- Wholesale customer panel
- Wallet and balance system
- Plans and customer-specific pricing
- Orders and invoices
- End-user configuration management
- 3x-ui server connection test
- 3x-ui inbound sync
- Subscription links
- PostgreSQL backend
- React + Vite frontend
- Express API backend
- Nginx reverse proxy
- Systemd production service

---

## Quick Install

Run this command on a fresh Ubuntu/Debian server:

    bash -c "$(curl -fsSL https://raw.githubusercontent.com/amiraliie/wholesale-panel-clean/main/install.sh)"

The installer will ask for:

- Panel domain or server IP
- Panel port
- Admin username
- Admin email
- Admin password

Default panel port:

    8080

After installation, open:

    http://YOUR_SERVER_IP:8080

---

## Install From Develop Branch

    BRANCH=develop bash -c "$(curl -fsSL https://raw.githubusercontent.com/amiraliie/wholesale-panel-clean/develop/install.sh)"

---

## Requirements

- Ubuntu 22.04 / 24.04
- Debian 12
- Root access
- 1GB RAM minimum
- PostgreSQL
- Node.js 20+
- Nginx

The installer installs required packages automatically.

---

## Production Files

Default install directory:

    /opt/wholesale-panel

Backend service:

    wholesale-panel-api.service

Nginx config:

    /etc/nginx/sites-available/wholesale-panel

Install info:

    /root/wholesale-panel-install-info.txt

---


## Backup and Restore

Super admins can download and restore PostgreSQL database backups from the admin panel:

- Admin Panel → Backup
- Download Backup
- Restore Backup

Backup files are generated with `pg_dump` in PostgreSQL custom format (`.backup`) and restored with `pg_restore`.

Important: when migrating to a new server, keep the same `ENCRYPTION_KEY` from the old `server/.env`; otherwise encrypted 3x-ui server credentials cannot be decrypted after restore.



### Migration note

For a fresh install, leave `Existing ENCRYPTION_KEY` empty during installation.

For server migration, copy the old `ENCRYPTION_KEY` from `/root/wholesale-panel-install-info.txt` or `server/.env` and paste it during installation on the new server before restoring the database backup.


## Useful Commands

Check backend status:

    systemctl status wholesale-panel-api.service --no-pager -l

View backend logs:

    journalctl -u wholesale-panel-api.service -f --no-pager

Restart backend:

    systemctl restart wholesale-panel-api.service

Reload Nginx:

    nginx -t && systemctl reload nginx

---

## Development

Clone the repository:

    git clone https://github.com/amiraliie/wholesale-panel-clean.git
    cd wholesale-panel-clean

Install dependencies:

    npm install
    npm --prefix server install

Run frontend:

    npm run dev:client

Run backend:

    npm run dev:server

Run both:

    npm run dev:all

Build everything:

    npm run check

---

## Environment

Frontend:

    cp .env.example .env

Backend:

    cp server/.env.example server/.env

Never commit real .env files.

---

## Database

Run migrations:

    npm run server:migrate

---

## Security Notes

- Keep the repository private until public installation is ready.
- Never commit .env files.
- Rotate credentials if they were ever committed.
- Restrict PostgreSQL access in production.
- Use HTTPS in production.

---

## License

Private / Proprietary.
