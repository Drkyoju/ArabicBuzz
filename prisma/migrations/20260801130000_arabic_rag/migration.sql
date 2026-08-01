-- Mirrored from supabase/migrations/003_arabic_rag.sql for Prisma migrate workflows
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL,
  title_ar text NOT NULL,
  content text NOT NULL,
  tsv_content tsvector GENERATED ALWAYS AS (to_tsvector('arabic', content)) STORED,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_scope_id_idx
  ON knowledge_documents (scope_id);

CREATE INDEX IF NOT EXISTS knowledge_documents_tsv_content_gin
  ON knowledge_documents USING GIN (tsv_content);

CREATE INDEX IF NOT EXISTS knowledge_documents_embedding_hnsw
  ON knowledge_documents
  USING hnsw (embedding vector_cosine_ops);
