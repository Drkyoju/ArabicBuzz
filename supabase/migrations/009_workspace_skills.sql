-- User-created skills (custom Arabic names) persisted for Netlify.
CREATE TABLE IF NOT EXISTS workspace_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  author TEXT,
  system_instructions TEXT NOT NULL,
  tools_required JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
