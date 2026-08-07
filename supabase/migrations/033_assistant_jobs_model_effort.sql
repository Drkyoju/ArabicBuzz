-- Persist model + effort on assistant queue jobs.
ALTER TABLE assistant_jobs
  ADD COLUMN IF NOT EXISTS model_slug TEXT,
  ADD COLUMN IF NOT EXISTS effort_level TEXT;

CREATE INDEX IF NOT EXISTS assistant_jobs_scope_user_status_idx
  ON assistant_jobs (scope_id, user_id, status);
