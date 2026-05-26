#!/usr/bin/env bash
# Deploy / update script — jalan di VPS sebagai user `ecc`.
# Untuk first deploy DAN re-deploy setelah git pull.
#
# Usage:
#   bash deploy/deploy.sh

set -euo pipefail

APP_DIR="/var/www/ecc-finance"

cd "$APP_DIR"

echo "═══════════════════════════════════════════════════════"
echo "ECC Finance — Deploy"
echo "═══════════════════════════════════════════════════════"

# ── 1. Pull latest code ──
echo "[1/6] Pull latest code dari main branch..."
git fetch origin
git checkout main
git pull origin main

# ── 2. Install dependencies ──
echo "[2/6] npm ci (production deps + dev untuk build)..."
npm ci

# ── 3. Verifikasi .env.local ──
if [ ! -f ".env.local" ]; then
  echo "❌ .env.local tidak ada. Copy dari deploy/.env.production.template lalu isi."
  exit 1
fi

# ── 4. Migrate DB ──
echo "[3/6] Apply DB migrations..."
npm run migrate

# ── 5. Seed auth codes kalau placeholder masih ada ──
echo "[4/6] Cek auth codes — kalau placeholder, seed (skip kalau sudah real hash)..."
NEEDS_SEED=$(psql "$(grep DATABASE_URL .env.local | cut -d'=' -f2-)" -tAc \
  "SELECT EXISTS(SELECT 1 FROM auth_codes WHERE code_hash LIKE 'PLACEHOLDER%')" 2>/dev/null || echo "f")
if [ "$NEEDS_SEED" = "t" ]; then
  echo "   → Placeholder ter-detect, jalankan seed..."
  npm run seed:auth
else
  echo "   → Auth codes sudah real hash, skip seed."
fi

# ── 6. Build ──
echo "[5/6] Build Next.js production bundle..."
npm run build

# ── 7. Reload PM2 (zero-downtime) atau start kalau belum ada ──
echo "[6/6] (Re)load PM2 process..."
if pm2 describe ecc-finance >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs --env production
  pm2 save
fi

pm2 status

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Deploy selesai."
echo "Logs: pm2 logs ecc-finance"
echo "═══════════════════════════════════════════════════════"
