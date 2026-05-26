#!/usr/bin/env bash
# Bootstrap script untuk VPS Ubuntu 22.04 / 24.04.
# Jalankan SEKALI saat first-time setup.
#
# Sebelum jalan: pastikan kamu login sebagai root atau user dengan sudo,
# dan domain finance.eccchurch.global sudah point ke IP server.
#
# Usage:
#   bash deploy/server-setup.sh

set -euo pipefail

APP_USER="ecc"
APP_DIR="/var/www/ecc-finance"
DB_NAME="ecc_finance"
DB_USER="ecc"
DB_PASS_FILE="$HOME/.ecc-finance-db-password"
DOMAIN="finance.eccchurch.global"
LOG_DIR="/var/log/ecc-finance"
UPLOAD_DIR="/var/www/ecc-finance-uploads"

echo "═══════════════════════════════════════════════════════"
echo "ECC Finance — VPS Bootstrap"
echo "Domain: $DOMAIN"
echo "═══════════════════════════════════════════════════════"

# ── 1. Update system ──
echo "[1/10] Update apt + install base packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release ufw fail2ban \
  build-essential git nginx postgresql postgresql-contrib

# ── 2. Install Node 20 LTS via NodeSource ──
echo "[2/10] Install Node.js 20 LTS..."
if ! command -v node >/dev/null || ! node -v | grep -q "v20"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

# ── 3. Install PM2 global ──
echo "[3/10] Install PM2..."
sudo npm install -g pm2

# ── 4. Bikin user dan folder ──
echo "[4/10] Setup user + folder..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --create-home --shell /bin/bash "$APP_USER"
fi
sudo mkdir -p "$APP_DIR" "$LOG_DIR" "$UPLOAD_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$LOG_DIR" "$UPLOAD_DIR"

# ── 5. Setup Postgres ──
echo "[5/10] Setup PostgreSQL..."
if [ ! -f "$DB_PASS_FILE" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  echo "$DB_PASS" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
  echo "  → Password DB disimpan di $DB_PASS_FILE"
else
  DB_PASS="$(cat "$DB_PASS_FILE")"
  echo "  → Reuse password dari $DB_PASS_FILE"
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

echo "  → DB: $DB_NAME, user: $DB_USER"
echo "  → DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

# ── 6. Setup Nginx ──
echo "[6/10] Setup Nginx vhost..."
if [ -f "$APP_DIR/deploy/nginx-vhost.conf" ]; then
  sudo cp "$APP_DIR/deploy/nginx-vhost.conf" /etc/nginx/sites-available/ecc-finance
  sudo ln -sf /etc/nginx/sites-available/ecc-finance /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
else
  echo "  ⚠ deploy/nginx-vhost.conf belum ada — clone repo dulu, jalankan ulang"
fi

# ── 7. Firewall ──
echo "[7/10] Setup firewall..."
sudo ufw --force enable
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'

# ── 8. Fail2ban (default config sudah cukup) ──
echo "[8/10] Enable fail2ban..."
sudo systemctl enable --now fail2ban

# ── 9. Install certbot untuk SSL ──
echo "[9/10] Install certbot..."
sudo apt-get install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

# ── 10. PM2 startup di-boot ──
echo "[10/10] PM2 boot startup..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp /home/"$APP_USER" || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Bootstrap selesai. Langkah berikutnya:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "1. Pastikan DNS A record:"
echo "   $DOMAIN → $(curl -s ifconfig.me)"
echo ""
echo "2. Issue SSL cert (setelah DNS propagasi):"
echo "   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@eccchurch.global"
echo ""
echo "3. Switch ke user $APP_USER lalu deploy app:"
echo "   sudo su - $APP_USER"
echo "   cd $APP_DIR"
echo "   git clone https://github.com/arichrst92/ecc-banking.git ."
echo "   cp deploy/.env.production.template .env.local"
echo "   # Edit .env.local — ganti DATABASE_URL dengan:"
echo "   #   postgresql://$DB_USER:\$(cat $DB_PASS_FILE)@localhost:5432/$DB_NAME"
echo "   bash deploy/deploy.sh"
echo ""
echo "4. PM2 save state supaya auto-start on reboot:"
echo "   pm2 save"
echo ""
