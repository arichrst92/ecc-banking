-- DEPRECATED — file ini di-replace oleh 0011_create_exchange_rates.sql.
-- Aplikasi pakai tabel `exchange_rates` (lihat src/lib/exchange-rate.ts).
-- File ini sengaja dikosongkan (no-op) supaya migrate runner tetap mencatatnya
-- sebagai "applied" dan tidak retry. Aman dihapus kalau yakin tidak ada VPS
-- lama yang masih punya entry "0011_currency_rates.sql" di _migrations.
SELECT 1;
