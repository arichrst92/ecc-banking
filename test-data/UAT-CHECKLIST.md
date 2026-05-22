# UAT Checklist v0.1 — End-to-End Walkthrough

Gunakan file mock `mutasi-mock-ecc-jktpusat-mei2026.csv` di folder ini. Data simulasi GKI Jakarta Pusat, periode 1-14 Mei 2026, 18 transaksi (4 in + 14 out).

**Saldo Awal:** Rp 50.000.000 · **Saldo Akhir:** Rp 25.650.000 · **Net:** −Rp 24.350.000

---

## Pre-Test Setup

```bash
cd ~/Projects/ecc-finance
npm run dev
```

1. Login sebagai **Global Administrator** dengan kode kamu (atau `00000000` kalau belum reset)
2. Buka `/kode-akses` — pastikan tidak ada placeholder lagi. Reset semua kalau perlu.
3. Buka `/cabang` — pastikan ada 4 cabang seed (JKT-P, JKT-S, BDG, SBY).
4. Buka `/cabang/1` (Jemaat Jakarta Pusat) — pastikan ada rekening **BCA 1234567890** dengan peruntukan "Kas Umum".
5. Pastikan rekening tersebut status="aktif", currency=NULL (belum pernah upload).

---

## Test 1: Upload + Detection

**Step:**
1. Buka `/upload`
2. Klik area drop file, pilih `mutasi-mock-ecc-jktpusat-mei2026.csv`
3. File nama harus muncul di bawah dropzone
4. Klik **"Deteksi & Preview"**

**Expected:**
- Redirect ke `/upload/<id>` (preview page)
- Detection panel hijau dengan ✅:
  - "No. Rekening: 1234567890"
  - "BCA — 1234567890" + "a.n. GKI Jakarta Pusat" (kalau di-set saat update) atau placeholder seed
  - Chip ungu peruntukan "Kas Umum"
  - Chip navy "Jemaat Jakarta Pusat (JKT-P)"
  - Chip amber "IDR"
- Info box kuning: "Currency akun belum di-set. Akan otomatis di-set ke IDR saat confirm"
- 4 stat-card: PERIODE (1 Mei — 14 Mei 2026), SALDO AWAL (Rp 50.000.000), SALDO AKHIR (Rp 25.650.000), JUMLAH TRANSAKSI (18 · 14 DB · 4 CR)
- **Balance Check: ✅ PASS** dengan breakdown matematika
- Tabel preview 18 transaksi (semua tampil karena ≤20)
- Tombol "Batal" + "Proses & Simpan" (tidak disabled)

**FAIL kalau:**
- Currency mismatch error
- Balance check FAIL (parser miss baris)
- Transaksi count != 18

---

## Test 2: Confirm Upload

**Step:**
1. Di halaman preview, klik **"✓ Proses & Simpan"**

**Expected:**
- Redirect ke `/upload` dengan toast hijau: "18 transaksi disimpan"
- Tabel "Upload Terakhir" tampilkan baris baru:
  - Status: chip "success"
  - Trx: 18 (tidak ada "+N dup")
  - Saldo Awal → Akhir tertulis di kolom

**Verifikasi via SQL** (psql ecc_finance):
```sql
SELECT COUNT(*) FROM transactions;
-- expected: 18 (atau 18 + jumlah dari upload sebelumnya kalau ada)

SELECT c.name, COUNT(*) AS jumlah, SUM(t.debit)::TEXT AS out_sum, SUM(t.credit)::TEXT AS in_sum
FROM transactions t JOIN categories c ON c.id=t.category_id
WHERE t.upload_id = (SELECT MAX(id) FROM uploads)
GROUP BY c.name ORDER BY jumlah DESC;

-- account currency harus ter-update jadi IDR
SELECT id, bank, account_number, currency, current_balance FROM accounts WHERE account_number = '1234567890';
-- expected: currency='IDR', current_balance=25650000.00
```

---

## Test 3: Auto-Categorization Verification

**Step:**
1. Buka `/transaksi`
2. Filter: cabang = Jemaat Jakarta Pusat, periode = 1 Mei – 14 Mei 2026

**Expected breakdown** (berdasarkan keyword default seed):

| Kategori | Expected count | Keterangan yang match |
|---|---|---|
| Persembahan | 4 | 2× PERSEMBAHAN + 2× PERPULUHAN/TITHE |
| Operasional | 5 | PLN, PDAM, TELKOM, 2× BIAYA ADM/ADMIN |
| Diakonia/Sosial | 3 | DIAKONIA, BANTUAN SOSIAL, DIAKONIA UMUM |
| Pembangunan | 2 | PEMBANGUNAN AULA, RENOVASI TOILET |
| Pelayanan & PA | 2 | RETREAT PEMUDA, DANA MISI |
| Lain-lain | 2 | HONOR PENDETA, TRANSPORT MAJELIS *(catatan: kemungkinan TRANSPORT MAJELIS RAPAT kena false positive "PA" → masuk Pelayanan & PA; lihat catatan limitasi di bawah)* |

**Catatan limitasi keyword "PA":**
Kategori Pelayanan & PA punya keyword `PA` yang merupakan substring di "RAPAT", "PEMBAYARAN", dll. Berpotensi false positive. Test ini akan mengungkap:
- "TRANSPORT MAJELIS RAPAT" → kemungkinan masuk Pelayanan & PA (RAPAT contains PA). **Bug behavior, perlu diketahui.**
- "PEMBAYARAN PLN/PDAM/TELKOM" — selamat karena Operasional priority 20 < Pelayanan 50, dicek dulu.

**Mitigation suggestion saat UAT:**
Edit kategori Pelayanan & PA di /kategori, ganti keyword `PA` → `PA REMAJA`, `PA WANITA`, `PA PRIA`, atau hapus dan andalkan keyword lain. Re-upload file → kategorisasi ulang. Atau re-categorize manual per row.

---

## Test 4: Re-Categorize Manual

**Step:**
1. Di `/transaksi`, cari baris "TRANSPORT MAJELIS RAPAT 4 ORG SINODE"
2. Klik dropdown di kolom Kategori, pilih **"Lain-lain"** (atau "Operasional")
3. Pastikan tidak ada loading spinner — perubahan langsung tersimpan
4. Refresh halaman — pastikan kategori baru persistent
5. Cari baris "HONOR PENDETA ANDREAS"
6. Ganti kategori ke **"Operasional"** (kalau dibuat kategori baru "Honor" dulu, ke situ)

**Verifikasi audit log:**
```sql
SELECT created_at, action, details
FROM audit_logs
WHERE action = 'recategorize_tx'
ORDER BY created_at DESC LIMIT 5;
-- expected: 2 rows untuk 2 perubahan barusan
```

---

## Test 5: Dashboard

**Step:**
1. Buka `/dashboard`

**Expected:**
- Subtitle: "Konsolidasi semua cabang aktif — periode Mei 2026"
- Stat card 4 kolom (1 currency = IDR):
  - TOTAL SALDO: Rp 25.650.000 (cuma 1 akun yang ada balance setelah upload)
  - PEMASUKAN BULAN INI: Rp 24.250.000 (4 transaksi)
  - PENGELUARAN BULAN INI: Rp 48.600.000 (18 transaksi total — note: ini total tx, bukan tx out only)
  - SALDO BERSIH BULAN INI: −Rp 24.350.000 (merah)
- Tabel "Per Cabang" — baris JKT-P IDR dengan saldo + in/out + 1 rekening

**Periksa kalau:**
- Currency display benar (IDR formatter id-ID)
- Negative balance ter-style merah
- Link "Laporan" di baris cabang berfungsi

---

## Test 6: Laporan + Chart

**Step:**
1. Buka `/laporan`
2. Filter: Cabang = Jemaat Jakarta Pusat, Dari = 2026-05-01, Sampai = 2026-05-14
3. Klik "Terapkan"

**Expected:**
- Tab bar rekening muncul, ada tab "BCA — 7890 · Kas Umum"
- Header gradient navy:
  - "Jemaat Jakarta Pusat" + "1 Mei 2026 — 14 Mei 2026"
  - PEMASUKAN: Rp 24.250.000 (hijau muda)
  - PENGELUARAN: Rp 48.600.000 (merah muda)
  - SALDO NETO: −Rp 24.350.000
  - TRANSAKSI: 18
- **Line chart kumulatif**: 2 garis (Pemasukan + Pengeluaran), naik bertahap sesuai tanggal
- **Doughnut chart proporsi**: 5 slice warna kategori (Operasional, Diakonia, Pembangunan, Pelayanan, Lain-lain) dengan persentase
- Tabel rincian per kategori dengan in/out/net per kategori

**Test edge:**
- Pilih rekening di tab bar → harus filter ke akun itu saja (count akan sama karena cuma 1 akun)
- Klik "Reset" → kembali ke konsolidasi semua cabang

---

## Test 7: Filter & Search Transaksi

**Step:**
1. Buka `/transaksi`
2. Test kombinasi filter:
   - **Cabang JKT-P** → 18 transaksi
   - **Kategori = Persembahan** → 4 transaksi (semua CR)
   - **Arah = Masuk** + Kategori reset → 4 transaksi
   - **Arah = Keluar** + Kategori = Operasional → 4–5 transaksi (tergantung re-categorize tadi)
   - **Search "PEMBAYARAN"** → 3 transaksi (PLN, PDAM, TELKOM)
   - **From=2026-05-10, To=2026-05-14** → 5 transaksi
   - Reset semua → 18 transaksi

**Expected:**
- URL berubah dengan query string saat filter applied
- Count di subtitle update real-time
- Pagination tidak muncul (< 50 transaksi)

---

## Test 8: Upload Duplikat

**Step:**
1. Upload file yang sama lagi (`mutasi-mock-ecc-jktpusat-mei2026.csv`)
2. Confirm di preview page

**Expected:**
- Tabel upload show baris baru
- Status: success
- Trx: **0 inserted, +18 dup** (semua duplikat di-skip via `dup_hash`)
- Toast: "0 transaksi disimpan, 18 duplikat di-skip"
- Total transaksi di DB tetap 18 (verify SQL)

---

## Test 9: RBAC Branch User

**Step:**
1. Logout
2. Login sebagai **Cabang / Jemaat** = Jemaat Jakarta Pusat, kode cabang yang sudah di-set
3. Akses semua menu

**Expected:**
- Sidebar tidak menampilkan "Kelola Cabang", "Kategori", "Kode Akses" (Global-only)
- `/cabang` redirect ke `/dashboard` kalau dipaksa via URL
- `/dashboard` cuma tampil data JKT-P
- `/laporan` filter cabang dropdown tidak tampil (auto-locked)
- `/transaksi` filter cabang dropdown tidak tampil
- Upload page bekerja untuk akun JKT-P only

**Test akses cross-cabang (harus blocked):**
- Coba upload file mock yang sama → harus jalan
- Coba akses `/cabang/2` (JKT-S) → redirect ke /dashboard
- Coba modify URL `/upload/N` untuk upload dari cabang lain → redirect

---

## Test 10: Edge Cases & Error Paths

**Test invalid login:**
1. Login dengan kode salah 6×
2. Attempt ke-6 harus: "Terlalu banyak percobaan. Tunggu 15 menit"
3. Verifikasi: `SELECT COUNT(*) FROM login_attempts WHERE success=false AND created_at > NOW() - INTERVAL '15 minutes';` ≥ 5

**Test upload bad file:**
1. Upload file CSV yang bukan format BCA (mis. random CSV)
2. Expected: error "Format file tidak didukung" atau "Nomor rekening tidak ditemukan"

**Test upload account not registered:**
1. Edit file mock, ganti "No. rekening : 1234567890" jadi "No. rekening : 9999999999"
2. Upload
3. Expected: error "Rekening 9999999999 tidak terdaftar"

**Test delete cabang yang punya akun:**
1. Coba hapus Jemaat Jakarta Pusat di `/cabang`
2. Expected: error "Tidak bisa hapus — N rekening masih terdaftar"

**Test delete kategori yang punya transaksi:**
1. Coba hapus kategori "Persembahan" di `/kategori`
2. Expected: error "Tidak bisa hapus — N transaksi masih pakai kategori ini"

---

## Bug Report Template

Kalau ada yang gagal, paste ke chat dengan format:

```
[Test #X — judul test]
Expected: ...
Actual: ...
Console error: ...
Screenshot: (kalau perlu)
```

---

## Kalau Semua PASS

Lanjut ke **C. Deploy VPS** untuk staging environment, atau **D. Export PDF/Excel** kalau pilot di local Mac dulu cukup.
