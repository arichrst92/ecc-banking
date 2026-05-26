#!/usr/bin/env bash
# Generate .env.local di /var/www/ecc-finance dari template, isi otomatis
# DATABASE_URL pakai password yang sudah di-generate server-setup.sh.
#
# Usage (sebagai user `ecc`):
#   bash /var/www/ecc-finance/deploy/setup-env.sh
#
# Argument optional: path ke password file (default /root/.ecc-finance-db-password)

set -euo pipefail

APP_DIR="/var/www/ecc-finance"
TEMPLATE="$APP_DIR/deploy/.env.production.template"
TARGET="$APP_DIR/.env.local"
PASS_FILE="${1:-/root/.ecc-finance-db-password}"

if [ -f "$TARGET" ]; then
  echo "⚠ $TARGET sudah ada. Backup ke $TARGET.bak"
  cp "$TARGET" "$TARGET.bak"
fi

if [ ! -f "$PASS_FILE" ]; then
  # Coba di home admin yang run bootstrap
  for u in admin root; do
    if sudo test -f "/home/$u/.ecc-finance-db-password"; then
      PASS_FILE="/home/$u/.ecc-finance-db-password"
      break
    fi
  done
fi

if ! sudo test -f "$PASS_FILE"; then
  echo "❌ Password file tidak ditemukan."
  echo "   Cari manual: sudo find / -name '.ecc-finance-db-password' 2>/dev/null"
  exit 1
fi

DB_PASS="$(sudo cat "$PASS_FILE")"
SESSION_SECRET="$(openssl rand -hex 32)"

cp "$TEMPLATE" "$TARGET"

# Replace placeholders pakai sed (delimiter | untuk avoid clash dengan : di URL)
sed -i "s|GANTI_DENGAN_DB_PASSWORD|$DB_PASS|" "$TARGET"
sed -i "s|GANTI_DENGAN_64_HEX_RANDOM_STRING|$SESSION_SECRET|" "$TARGET"

chmod 600 "$TARGET"

echo ""
echo "✅ $TARGET ter-generate."
echo ""
echo "Yang sudah diisi otomatis:"
echo "  • DATABASE_URL (pakai password dari $PASS_FILE)"
echo "  • SESSION_SECRET (random 64-hex baru)"
echo "  • NEXT_PUBLIC_APP_URL = https://finance.eccchurch.global"
echo "  • UPLOAD_DIR = /var/www/ecc-finance-uploads"
echo ""
echo "WAJIB ISI MANUAL — edit dengan nano:"
echo "  • ANTHROPIC_API_KEY  (dari console.anthropic.com)"
echo ""
echo "Edit:"
echo "  nano $TARGET"
echo ""
echo "Verify DB connection bisa:"
echo "  psql \"\$(grep DATABASE_URL $TARGET | cut -d= -f2-)\" -c 'SELECT 1'"
