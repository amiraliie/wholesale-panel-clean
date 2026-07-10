# 🚀 راهنمای استقرار (Deployment Guide)

## پیش‌نیازها

### سرور
- Ubuntu 20.04+ یا Debian 11+
- حداقل 2GB RAM
- حداقل 20GB فضای دیسک
- دسترسی root یا sudo

### نرم‌افزارها
- Docker 20.10+
- Docker Compose 2.0+
- Git

## مرحله ۱: نصب Docker

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

## مرحله ۲: کلون پروژه

```bash
# Clone repository
cd /opt
sudo git clone <your-repo-url> wholesale-panel
cd wholesale-panel

# Set permissions
sudo chown -R $USER:$USER /opt/wholesale-panel
```

## مرحله ۳: تنظیم Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit environment variables
nano .env
```

متغیرهای مهم:
```env
# Database
DB_PASSWORD=your-strong-password-here

# JWT
JWT_SECRET=your-very-long-random-secret-key-min-32-chars

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key!!

# API
API_URL=https://api.yourdomain.com
APP_URL=https://panel.yourdomain.com
```

## مرحله ۴: تنظیم SSL (اختیاری اما توصیه شده)

### با Caddy (ساده‌تر)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Create Caddyfile
sudo nano /etc/caddy/Caddyfile
```

محتوای Caddyfile:
```
panel.yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:4000
}
```

```bash
# Restart Caddy
sudo systemctl restart caddy
```

### با Nginx + Certbot

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx -y

# Create nginx config
sudo nano /etc/nginx/sites-available/wholesale-panel
```

```nginx
server {
    listen 80;
    server_name panel.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/wholesale-panel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d panel.yourdomain.com
```

## مرحله ۵: اجرای Docker Compose

```bash
cd /opt/wholesale-panel

# Build and start containers
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

## مرحله ۶: تأیید نصب

```bash
# Check if containers are running
docker ps

# Check logs for errors
docker-compose logs web
docker-compose logs db

# Test health endpoint
curl http://localhost:3000/health
```

## مرحله ۷: Backup Setup

### اسکریپت بکاپ خودکار

```bash
# Create backup script
sudo nano /opt/wholesale-panel/backup.sh
```

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/opt/backups/wholesale-panel"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
KEEP_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker exec wholesale-panel_db_1 pg_dump -U postgres wholesale_panel | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Delete old backups
find $BACKUP_DIR -type f -mtime +$KEEP_DAYS -delete

echo "Backup completed: $BACKUP_DIR/db_$DATE.sql.gz"
```

```bash
# Make executable
chmod +x /opt/wholesale-panel/backup.sh

# Add to crontab (daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/wholesale-panel/backup.sh") | crontab -
```

## مرحله ۸: مانیتورینگ

### با Docker Stats

```bash
# Real-time stats
docker stats
```

### با Prometheus + Grafana (اختیاری)

فایل `docker-compose.monitoring.yml`:
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  grafana_data:
```

## دستورات مفید

```bash
# Restart all containers
docker-compose restart

# Rebuild and restart
docker-compose up -d --build

# Stop all containers
docker-compose down

# View logs
docker-compose logs -f [service_name]

# Enter container shell
docker exec -it wholesale-panel_web_1 sh

# Database shell
docker exec -it wholesale-panel_db_1 psql -U postgres wholesale_panel

# Clear unused images
docker system prune -a
```

## عیب‌یابی

### Container خراب است
```bash
docker-compose logs [service_name]
docker-compose restart [service_name]
```

### دیتابیس متصل نمی‌شود
```bash
# Check if db is running
docker-compose ps db

# Check db logs
docker-compose logs db

# Verify connection
docker exec -it wholesale-panel_db_1 pg_isready
```

### Out of memory
```bash
# Check memory usage
free -h
docker stats --no-stream

# Add swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## امنیت

### Firewall Setup

```bash
# Install UFW
sudo apt install ufw

# Default deny
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Fail2Ban

```bash
# Install
sudo apt install fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## بروزرسانی

```bash
cd /opt/wholesale-panel

# Pull latest changes
git pull origin main

# Rebuild containers
docker-compose up -d --build

# Verify
docker-compose ps
```
