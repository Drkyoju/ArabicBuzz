-- Assistant task queue — free-text composer → workers (capped parallel).
CREATE TABLE IF NOT EXISTS assistant_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  assistant_name_ar TEXT NOT NULL DEFAULT 'مساعد',
  matched_by TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'running', 'done', 'failed', 'cancelled')),
  result_text TEXT,
  used_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_approval_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_ar TEXT,
  eta_seconds INT NOT NULL DEFAULT 40,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_jobs_scope_created_idx
  ON assistant_jobs (scope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_jobs_scope_status_idx
  ON assistant_jobs (scope_id, status);

ALTER TABLE assistant_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_jobs_all ON assistant_jobs;
CREATE POLICY assistant_jobs_all ON assistant_jobs FOR ALL USING (true) WITH CHECK (true);
