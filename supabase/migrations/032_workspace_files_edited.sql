-- Track agent/user edits on room workspace files (تم التعديل badge)
ALTER TABLE workspace_files
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS workspace_files_edited_idx
  ON workspace_files (scope_id, edited_at DESC NULLS LAST)
  WHERE edited_at IS NOT NULL;
