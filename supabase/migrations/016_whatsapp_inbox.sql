-- WhatsApp task inbox threads (owner HITL)
-- Apply via Supabase SQL or: psql "$DATABASE_URL" -f supabase/migrations/009_whatsapp_inbox.sql

CREATE TABLE IF NOT EXISTS whatsapp_inbox_threads (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester_phone text NOT NULL,
  scope_id text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending_owner', 'running', 'done', 'cancelled')
  ),
  intent_kind text NOT NULL,
  summary_ar text NOT NULL DEFAULT '',
  original_message_ar text NOT NULL,
  inbound_type text NOT NULL DEFAULT 'text' CHECK (
    inbound_type IN ('text', 'audio')
  ),
  owner_question_ar text,
  agent_context_ar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_inbox_threads_status_idx
  ON whatsapp_inbox_threads (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_inbox_threads_requester_idx
  ON whatsapp_inbox_threads (requester_phone, status);

CREATE INDEX IF NOT EXISTS whatsapp_inbox_threads_scope_idx
  ON whatsapp_inbox_threads (scope_id, status);

ALTER TABLE whatsapp_inbox_threads ENABLE ROW LEVEL SECURITY;
