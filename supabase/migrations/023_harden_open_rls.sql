-- Harden RLS: replace USING(true)/WITH CHECK(true) open policies.
-- Supabase Security Advisor flags these as always-true / permissive.
-- App server continues via service_role (bypasses RLS). Anon/auth clients
-- must not read/write association data or secrets via PostgREST.

-- provider_api_keys: deny all non-service roles
CREATE TABLE IF NOT EXISTS provider_api_keys (
  env_name TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE provider_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_api_keys_deny_all ON provider_api_keys;
CREATE POLICY provider_api_keys_deny_all ON provider_api_keys
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Helper: drop open policies by known names then deny
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual = 'true'
        OR with_check = 'true'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

-- Ensure RLS on sensitive room / association tables + deny anon/auth by default.
-- Membership-scoped policies can be added later; until then only service_role works.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'room_posts',
    'room_invites',
    'room_canvas_artifacts',
    'room_agents',
    'room_agent_memberships',
    'room_members',
    'room_canvas_audit',
    'room_calendar_events',
    'room_activity_log',
    'zoom_session_log',
    'room_memories',
    'room_tasks',
    'mcp_connections',
    'room_committee_channels',
    'workspace_files',
    'whatsapp_inbox_threads',
    'knowledge_documents',
    'workspace_file_versions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_deny_clients', t);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        t || '_deny_clients',
        t
      );
    END IF;
  END LOOP;
END $$;
