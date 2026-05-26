# Deploy ke VPS

**Target:** `finance.eccchurch.global` di VPS `187.77.118.82`

Stack production:
- Ubuntu 22.04 / 24.04 LTS
- Node.js 20 LTS
- PostgreSQL 16 (local)
- PM2 (process manager)
- Nginx (reverse proxy + static)
- Let's Encrypt SSL via certbot
- ufw firewall + fail2ban

Total downtime untuk deploy pertama: ~30-45 menit. Subsequent deploys: ~1-2 menit (zero-downtime via PM2 reload).

---

## Step 0 — Persiapan DNS

Sebelum mulai, set DNS A record di provider domain `eccchurch.global`:

```
finance.eccchurch.global  →  A  →  187.77.118.82  (TTL 300)
```

Tunggu propagasi (biasanya 5-15 menit). Verifikasi:

```bash
dig +short finance.eccchurch.global
# Output expected: 187.77.118.82
```

---

## Step 1 — SSH ke VPS

```bash
ssh root@187.77.118.82
# atau pakai user dengan sudo
```

Update OS:

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

Buat user non-root dengan sudo (kalau belum):

```bash
# Skip kalau sudah login sebagai non-root user
adduser admin
usermod -aG sudo admin
```

---

## Step 2 — Clone repo + run bootstrap

Sebagai user dengan sudo (mis. `root` atau `admin`):

```bash
# Clone repo dulu ke folder app
sudo mkdir -p /var/www/ecc-finance
sudo chown $USER:$USER /var/www/ecc-finance
cd /var/www/ecc-finance
git clone https://github.com/arichrst92/ecc-banking.git .

# Jalankan bootstrap (idempotent — aman re-run)
bash deploy/server-setup.sh
```

Bootstrap akan:
- Install Node 20 + PM2 + Nginx + PostgreSQL + ufw + fail2ban + certbot
- Bikin user `ecc` (untuk run app)
- Bikin folder `/var/www/ecc-finance` + `/var/log/ecc-finance` + `/var/www/ecc-finance-uploads`
- Bikin DB `ecc_finance` + user `ecc` dengan password random (disimpan di `~/.ecc-finance-db-password`)
- Copy Nginx vhost
- Setup firewall (allow SSH + Nginx)
- Enable fail2ban
- Setup PM2 boot startup

Output di akhir akan tampilkan:
- Path file password DB
- DATABASE_URL connection string
- Langkah lanjutan

---

## Step 3 — Issue SSL certificate

Setelah DNS sudah point ke server, request Let's Encrypt cert:

```bash
sudo certbot --nginx -d finance.eccchurch.global \
  --non-interactive --agree-tos -m admin@eccchurch.global
```

Certbot otomatis update Nginx vhost dengan SSL cert + redirect. Auto-renew via systemd timer (sudah default).

Verifikasi:

```bash
sudo certbot certificates
sudo systemctl status certbot.timer
```

---

## Step 4 — Setup app sebagai user `ecc`

Switch user + copy ownership:

```bash
sudo chown -R ecc:ecc /var/www/ecc-finance
sudo su - ecc
cd /var/www/ecc-finance
```

Kalau folder `.git` masih milik user yang clone, fix permission:

```bash
exit  # kembali ke admin/root
sudo chown -R ecc:ecc /var/www/ecc-finance
sudo su - ecc
cd /var/www/ecc-finance
```

Setup `.env.local`:

```bash
cp deploy/.env.production.template .env.local
nano .env.local
```

Isi field berikut:

- `DATABASE_URL` — ganti `GANTI_DENGAN_DB_PASSWORD` dengan isi file `~/.ecc-finance-db-password` (cek dengan `cat ~/.ecc-finance-db-password` saat masih jadi user yang run bootstrap)
- `SESSION_SECRET` — generate baru: `openssl rand -hex 32`
- `ANTHROPIC_API_KEY` — dari console.anthropic.com (production key, terpisah dari local dev)
- `NEXT_PUBLIC_APP_URL` — sudah benar `https://finance.eccchurch.global`

Save (`Ctrl-O`, Enter, `Ctrl-X`).

---

## Step 5 — Deploy pertama

```bash
cd /var/www/ecc-finance
bash deploy/deploy.sh
```

Script ini:
1. Pull latest code
2. `npm ci` install dependencies
3. Verifikasi `.env.local` ada
4. `npm run migrate` — apply semua SQL migration
5. `npm run seed:auth` (cuma kalau auth codes masih placeholder)
6. `npm run build` — generate Next.js production bundle
7. `pm2 start` atau `pm2 reload` (zero-downtime kalau sudah running)

Verifikasi:

```bash
pm2 status
pm2 logs ecc-finance --lines 50
```

Tes lokal di VPS:

```bash
curl -I http://localhost:3000
# Expected: HTTP/1.1 200 OK
```

Tes via domain:

```bash
curl -I https://finance.eccchurch.global
# Expected: HTTP/2 200
```

Buka di browser: <https://finance.eccchurch.global>

Login pakai kode default `00000000` (Global). **WAJIB ganti via menu Kode Akses sebelum dipakai bendahara.**

---

## Step 6 — Setup backup harian

Sebagai user `ecc`:

```bash
crontab -e
```

Tambahkan baris:

```
0 2 * * * /var/www/ecc-finance/deploy/backup-db.sh >> /var/log/ecc-finance/backup.log 2>&1
```

Save. Backup jalan setiap jam 02:00 lokal:
- DB dump → `/var/backups/ecc-finance/ecc_finance-YYYYMMDD-HHMMSS.sql.gz`
- Uploads folder → `/var/backups/ecc-finance/uploads-YYYYMMDD-HHMMSS.tar.gz`
- Retention 30 hari (auto-cleanup)

**Disarankan tambah:** sync backup ke remote storage (S3 / Cloudflare R2 / rclone).

---

## Workflow update code (subsequent deploys)

Setelah perubahan di-push ke GitHub:

```bash
sudo su - ecc
cd /var/www/ecc-finance
bash deploy/deploy.sh
```

Selesai. ~1-2 menit, zero-downtime via PM2 reload.

---

## Operational

### Cek status

```bash
pm2 status              # status app
pm2 logs ecc-finance    # live logs
pm2 monit               # interactive dashboard
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status fail2ban
```

### Restart app

```bash
pm2 restart ecc-finance   # restart cepat
pm2 reload ecc-finance    # zero-downtime
```

### Cek logs

| Source | Path |
|---|---|
| App stdout | `/var/log/ecc-finance/out.log` |
| App stderr | `/var/log/ecc-finance/error.log` |
| Nginx access | `/var/log/nginx/ecc-finance-access.log` |
| Nginx error | `/var/log/nginx/ecc-finance-error.log` |
| Backup | `/var/log/ecc-finance/backup.log` |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log` |

### Restore dari backup

```bash
# List backup
ls -lh /var/backups/ecc-finance/

# Restore DB (HATI-HATI: drop semua data dulu)
gunzip -c /var/backups/ecc-finance/ecc_finance-20260601-020000.sql.gz | \
  psql "postgresql://ecc:PASSWORD@localhost:5432/ecc_finance_restore"

# Untuk uploads:
tar -xzf /var/backups/ecc-finance/uploads-20260601-020000.tar.gz -C /tmp/
# Lalu copy file yang perlu dari /tmp/ecc-finance-uploads/
```

### Buka access lain (kalau perlu)

```bash
# Mis. buka port 8080 untuk monitoring
sudo ufw allow 8080/tcp
```

### Disable site sementara (maintenance)

```bash
sudo ln -sf /etc/nginx/sites-available/maintenance /etc/nginx/sites-enabled/ecc-finance
sudo nginx -s reload
```

(Bikin `maintenance` vhost terpisah yang return 503 page kalau perlu)

---

## Security hardening (rekomendasi tambahan)

### Disable SSH password login (pakai key only)

```bash
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no
sudo systemctl reload sshd
```

### Custom SSH port (defense in depth)

```bash
sudo nano /etc/ssh/sshd_config
# Set: Port 2222
sudo ufw allow 2222/tcp
sudo ufw delete allow OpenSSH
sudo systemctl reload sshd
```

### Postgres listen only localhost

Default Ubuntu Postgres sudah hanya listen 127.0.0.1. Verify:

```bash
sudo netstat -tlnp | grep postgres
# Expected: 127.0.0.1:5432, NOT 0.0.0.0:5432
```

### Auto-update keamanan

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## Troubleshooting

### App tidak start

```bash
pm2 logs ecc-finance --lines 100
# Cari error di output. Common: missing env var, port already in use, DB connection failed
```

### Nginx 502 Bad Gateway

App belum running atau port salah. Check:

```bash
pm2 status
curl -I http://localhost:3000  # harus 200
```

### SSL cert expired

Auto-renew biasanya jalan tiap 3 bulan via systemd timer. Manual renew:

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### DB connection refused

```bash
sudo systemctl status postgresql
sudo systemctl restart postgresql

# Check connection
psql "$(grep DATABASE_URL /var/www/ecc-finance/.env.local | cut -d'=' -f2-)" -c "SELECT 1"
```

### Disk full

Backup folder bisa membengkak. Cleanup:

```bash
sudo du -sh /var/backups/* /var/log/* /var/www/* | sort -h
```

PM2 logs juga bisa besar. Setup logrotate:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

---

## Quick reference

| Task | Command |
|---|---|
| Deploy update | `cd /var/www/ecc-finance && bash deploy/deploy.sh` |
| View live logs | `pm2 logs ecc-finance` |
| Restart app | `pm2 restart ecc-finance` |
| Reload (zero-downtime) | `pm2 reload ecc-finance` |
| Backup DB | `bash deploy/backup-db.sh` |
| Nginx reload | `sudo systemctl reload nginx` |
| SSL renew | `sudo certbot renew` |
| Check disk | `df -h && du -sh /var/backups/*` |
