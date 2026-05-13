-- Migration 0004: Seed default data

INSERT INTO categories (name, type, keywords, color, priority, is_system) VALUES
  ('Persembahan',     'masuk',    ARRAY['PERSEMBAHAN','TITHE','PERPULUHAN','PERSEMBAHN'], '#2e7d6e', 10,  false),
  ('Operasional',     'keluar',   ARRAY['PLN','PDAM','TELKOM','ADMIN','BIAYA'],            '#c0392b', 20,  false),
  ('Diakonia/Sosial', 'keluar',   ARRAY['DIAKONIA','SOSIAL','BANTUAN'],                    '#e67e22', 30,  false),
  ('Pembangunan',     'keduanya', ARRAY['PEMBANGUNAN','RENOVASI','GKI BANGUN'],            '#8e44ad', 40,  false),
  ('Pelayanan & PA',  'keduanya', ARRAY['RETREAT','PA','MISI','KKR','PELAYANAN'],          '#2563eb', 50,  false),
  ('Lain-lain',       'keduanya', ARRAY[]::TEXT[],                                         '#8a94a6', 999, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (name, code, pic_name, pic_phone, status) VALUES
  ('Jemaat Jakarta Pusat',   'JKT-P', 'Pdt. Andreas Santoso',  NULL, 'aktif'),
  ('Jemaat Jakarta Selatan', 'JKT-S', 'Ibu Maria Kristiana',   NULL, 'aktif'),
  ('Jemaat Bandung',         'BDG',   'Bpk. Yohanes Kurnia',   NULL, 'review'),
  ('Jemaat Surabaya',        'SBY',   'Pdt. Samuel Wibowo',    NULL, 'aktif')
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (branch_id, bank, account_number, account_holder, purpose, status, current_balance) VALUES
  ((SELECT id FROM branches WHERE code='JKT-P'), 'BCA',     '1234567890', 'GKI Jakarta Pusat',  'Kas Umum',                    'aktif', 0),
  ((SELECT id FROM branches WHERE code='JKT-P'), 'BCA',     '2345678901', 'GKI Jakarta Pusat',  'Dana Sosial & Diakonia',      'aktif', 0),
  ((SELECT id FROM branches WHERE code='JKT-P'), 'Mandiri', '1111222233', 'GKI Jakarta Pusat',  'Dana Pembangunan Gedung',     'aktif', 0),
  ((SELECT id FROM branches WHERE code='JKT-S'), 'Mandiri', '0987654321', 'GKI Jakarta Selatan','Kas Umum',                    'aktif', 0),
  ((SELECT id FROM branches WHERE code='JKT-S'), 'BNI',     '9988776655', 'GKI Jakarta Selatan','Dana Retreat & Pelayanan',    'aktif', 0),
  ((SELECT id FROM branches WHERE code='BDG'),   'BNI',     '5544332211', 'GKI Bandung',        'Kas Umum',                    'aktif', 0),
  ((SELECT id FROM branches WHERE code='BDG'),   'BCA',     '6677889900', 'GKI Bandung',        'Dana Pembangunan GKI Bandung','aktif', 0),
  ((SELECT id FROM branches WHERE code='SBY'),   'BRI',     '1122334455', 'GKI Surabaya',       'Kas Umum',                    'aktif', 0)
ON CONFLICT (bank, account_number) DO NOTHING;

INSERT INTO auth_codes (scope, branch_id, code_hash, is_active) VALUES
  ('global', NULL, 'PLACEHOLDER_RUN_SEED_AUTH', true)
ON CONFLICT DO NOTHING;

INSERT INTO auth_codes (scope, branch_id, code_hash, is_active)
SELECT 'branch', id, 'PLACEHOLDER_RUN_SEED_AUTH', true
FROM branches
ON CONFLICT DO NOTHING;
