-- Knowledge RLS + workspace file version ledger
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_documents_deny_anon ON knowledge_documents;
CREATE POLICY knowledge_documents_deny_anon ON knowledge_documents
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- Authenticated users: only scopes they belong to (room_members)
DROP POLICY IF EXISTS knowledge_documents_member_read ON knowledge_documents;
CREATE POLICY knowledge_documents_member_read ON knowledge_documents
  FOR SELECT TO authenticated
  USING (
    scope_id IN (
      SELECT rm.scope_id FROM room_members rm
      WHERE rm.user_id = auth.uid()::text
         OR lower(coalesce(rm.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

DROP POLICY IF EXISTS knowledge_documents_member_write ON knowledge_documents;
CREATE POLICY knowledge_documents_member_write ON knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    scope_id IN (
      SELECT rm.scope_id FROM room_members rm
      WHERE rm.user_id = auth.uid()::text
         OR lower(coalesce(rm.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- service_role bypasses RLS (server ingest / hybrid search)

CREATE TABLE IF NOT EXISTS workspace_file_versions (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  source_file_id TEXT,
  version_tag TEXT NOT NULL,
  file_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_file_versions_scope_idx
  ON workspace_file_versions (scope_id, created_at DESC);

ALTER TABLE workspace_file_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_file_versions_deny_anon ON workspace_file_versions;
CREATE POLICY workspace_file_versions_deny_anon ON workspace_file_versions
  FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS workspace_file_versions_member_read ON workspace_file_versions;
CREATE POLICY workspace_file_versions_member_read ON workspace_file_versions
  FOR SELECT TO authenticated
  USING (
    scope_id IN (
      SELECT rm.scope_id FROM room_members rm
      WHERE rm.user_id = auth.uid()::text
         OR lower(coalesce(rm.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
