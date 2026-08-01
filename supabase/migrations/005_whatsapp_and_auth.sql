-- WhatsApp message log + approval resolution columns for Supabase/Postgres
-- Apply: psql "$DATABASE_URL" -f supabase/migrations/005_whatsapp_and_auth.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extra columns used by Telegram/WhatsApp HITL callbacks
ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS scope_id text;

ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS resolution_note_ar text;

ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS pending_approvals_scope_id_idx
  ON pending_approvals (scope_id);

-- Primary WhatsApp turn log (used by lib/supabase/server.ts)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel text NOT NULL DEFAULT 'whatsapp',
  external_id text NOT NULL,
  scope_id text NOT NULL,
  inbound_type text NOT NULL CHECK (inbound_type IN ('text', 'audio')),
  user_message_ar text NOT NULL,
  agent_reply_ar text NOT NULL,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_external_id_idx
  ON whatsapp_messages (external_id);

CREATE INDEX IF NOT EXISTS whatsapp_messages_created_at_idx
  ON whatsapp_messages (created_at DESC);

-- Fallback table name used by saveWhatsAppTurnToSupabase()
CREATE TABLE IF NOT EXISTS channel_messages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel text NOT NULL,
  channel_kind text,
  external_id text NOT NULL,
  scope_id text NOT NULL,
  inbound_type text,
  user_message_ar text,
  agent_reply_ar text,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_messages_external_id_idx
  ON channel_messages (external_id);

-- Profiles mirror for Supabase Auth users (optional app join)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on auth.users insert (safe if auth schema exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.profiles (id, email, full_name, avatar_url)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = now();
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_select ON profiles;
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT USING (id::text = app.current_user_id());

DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (id::text = app.current_user_id());

DROP POLICY IF EXISTS profiles_self_insert ON profiles;
CREATE POLICY profiles_self_insert ON profiles
  FOR INSERT WITH CHECK (id::text = app.current_user_id());
