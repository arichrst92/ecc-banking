-- Migration 0003: audit_logs, ai_analyses, login_attempts

CREATE TABLE IF NOT EXISTS login_attempts (
  id                   BIGSERIAL PRIMARY KEY,
  ip_address           TEXT         NOT NULL,
  user_agent           TEXT,
  attempted_scope      TEXT         NOT NULL CHECK (attempted_scope IN ('global','branch')),
  attempted_branch_id  BIGINT       REFERENCES branches(id) ON DELETE SET NULL,
  success              BOOLEAN      NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time    ON login_attempts(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                BIGSERIAL PRIMARY KEY,
  actor_role        TEXT         NOT NULL,
  actor_branch_id   BIGINT       REFERENCES branches(id) ON DELETE SET NULL,
  action            TEXT         NOT NULL,
  target_table      TEXT,
  target_id         BIGINT,
  details           JSONB,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time         ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time  ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_branch ON audit_logs(actor_branch_id);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id                      BIGSERIAL PRIMARY KEY,
  branch_id               BIGINT       REFERENCES branches(id) ON DELETE CASCADE,
  period_from             DATE         NOT NULL,
  period_to               DATE         NOT NULL,
  summary_input           JSONB        NOT NULL,
  markdown_result         TEXT         NOT NULL,
  model                   TEXT         NOT NULL,
  input_tokens            INT,
  output_tokens           INT,
  cost_usd                NUMERIC(10,4),
  requested_by_role       TEXT         NOT NULL,
  requested_by_branch_id  BIGINT       REFERENCES branches(id) ON DELETE SET NULL,
  expires_at              TIMESTAMPTZ  NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_cache   ON ai_analyses(branch_id, period_from, period_to, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_expires ON ai_analyses(expires_at);
