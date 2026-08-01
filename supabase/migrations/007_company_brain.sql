-- Company brain: text scope ids + source tracking for local Mac / uploads
ALTER TABLE knowledge_documents
  ALTER COLUMN scope_id TYPE text USING scope_id::text;

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS source_file_id text;

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS source_path text;

CREATE INDEX IF NOT EXISTS knowledge_documents_source_file_idx
  ON knowledge_documents (source_file_id);
