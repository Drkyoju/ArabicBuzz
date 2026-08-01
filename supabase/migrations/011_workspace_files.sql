-- Cloud fallback for room file uploads when Mac vault / Netlify local FS unavailable
CREATE TABLE IF NOT EXISTS workspace_files (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  kind TEXT NOT NULL DEFAULT 'other',
  size INT NOT NULL DEFAULT 0,
  content_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_files_scope_idx
  ON workspace_files (scope_id, created_at DESC);

ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_files_all ON workspace_files;
CREATE POLICY workspace_files_all ON workspace_files
  FOR ALL USING (true) WITH CHECK (true);
