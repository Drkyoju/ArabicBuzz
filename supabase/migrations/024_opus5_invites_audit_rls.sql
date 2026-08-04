-- Opus 5: invite lifecycle + canvas audit locked + drop remaining true policies.

ALTER TABLE room_invites
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_uses INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS used_count INT NOT NULL DEFAULT 0;

UPDATE room_invites
SET expires_at = COALESCE(expires_at, created_at + INTERVAL '7 days')
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION room_invites_set_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '7 days';
  END IF;
  IF NEW.max_uses IS NULL OR NEW.max_uses < 1 THEN
    NEW.max_uses := 1;
  END IF;
  IF NEW.used_count IS NULL THEN
    NEW.used_count := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_invites_defaults_trg ON room_invites;
CREATE TRIGGER room_invites_defaults_trg
  BEFORE INSERT ON room_invites
  FOR EACH ROW
  EXECUTE FUNCTION room_invites_set_defaults();

-- Drop any remaining always-true policies
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  END LOOP;
END $$;

-- Ensure RLS on all public tables
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Canvas audit: deny clients (append only via service_role)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'room_canvas_audit'
  ) THEN
    ALTER TABLE room_canvas_audit ENABLE ROW LEVEL SECURITY;
    ALTER TABLE room_canvas_audit FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS room_canvas_audit_deny_clients ON room_canvas_audit;
    CREATE POLICY room_canvas_audit_deny_clients ON room_canvas_audit
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;
