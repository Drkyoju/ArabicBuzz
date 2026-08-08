-- Durable Telegram attachment mirror + incomplete file-work job queue.
-- Persist on receive; resume unfinished work without asking the user to resend.

CREATE TABLE IF NOT EXISTS telegram_attachments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chat_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  telegram_file_id TEXT,
  file_unique_id TEXT,
  message_id TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INT,
  vault_file_id TEXT,
  has_bytes BOOLEAN NOT NULL DEFAULT false,
  download_error_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_attachments_chat_created_idx
  ON telegram_attachments (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_attachments_scope_created_idx
  ON telegram_attachments (scope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_attachments_vault_idx
  ON telegram_attachments (vault_file_id)
  WHERE vault_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_attachments_tg_file_idx
  ON telegram_attachments (telegram_file_id)
  WHERE telegram_file_id IS NOT NULL;

ALTER TABLE telegram_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_attachments_all ON telegram_attachments;
CREATE POLICY telegram_attachments_all ON telegram_attachments
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS telegram_file_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chat_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting_file', 'done', 'failed')),
  request_text TEXT NOT NULL DEFAULT '',
  expected_filename TEXT NOT NULL DEFAULT '',
  attachment_id TEXT,
  vault_file_id TEXT,
  telegram_file_id TEXT,
  work_kind TEXT NOT NULL DEFAULT 'file',
  work_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_ar TEXT,
  notified_waiting_file BOOLEAN NOT NULL DEFAULT false,
  result_vault_file_id TEXT,
  result_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_file_jobs_chat_status_idx
  ON telegram_file_jobs (chat_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_file_jobs_scope_status_idx
  ON telegram_file_jobs (scope_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_file_jobs_waiting_idx
  ON telegram_file_jobs (status, expected_filename)
  WHERE status IN ('pending', 'waiting_file', 'failed');

ALTER TABLE telegram_file_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_file_jobs_all ON telegram_file_jobs;
CREATE POLICY telegram_file_jobs_all ON telegram_file_jobs
  FOR ALL USING (true) WITH CHECK (true);
