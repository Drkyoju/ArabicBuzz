-- Multi-tenant org isolation + Row-Level Security
-- Apply: psql "$DATABASE_URL" -f supabase/migrations/004_rbac_rls.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE org_role AS ENUM (
    'OWNER',
    'ADMIN',
    'DEPARTMENT_MANAGER',
    'MEMBER',
    'AUDITOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Organizations + membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'MEMBER',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_user_org_unique UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS organization_members_org_id_idx
  ON organization_members (org_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx
  ON organization_members (user_id);

-- Scope ↔ user/org grants used by RLS policies
CREATE TABLE IF NOT EXISTS scope_permissions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id text NOT NULL,
  user_id text,
  org_id text REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_permissions_principal_chk CHECK (
    user_id IS NOT NULL OR org_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS scope_permissions_scope_id_idx
  ON scope_permissions (scope_id);
CREATE INDEX IF NOT EXISTS scope_permissions_user_id_idx
  ON scope_permissions (user_id);
CREATE INDEX IF NOT EXISTS scope_permissions_org_id_idx
  ON scope_permissions (org_id);

-- pending_approvals needs scope_id for org isolation
ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS scope_id text;

CREATE INDEX IF NOT EXISTS pending_approvals_scope_id_idx
  ON pending_approvals (scope_id);

-- ---------------------------------------------------------------------------
-- Auth helpers
-- Supabase already ships auth.uid() → uuid. Never REPLACE that.
-- Local/dev without Supabase Auth: create a text shim once if missing.
-- Policies compare with auth.uid()::text so both shapes work.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid()
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $body$
        SELECT NULLIF(current_setting('app.current_user_id', true), '');
      $body$
    $fn$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '');
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    auth.uid()::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE session_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_threads FORCE ROW LEVEL SECURITY;

ALTER TABLE scope_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_memories FORCE ROW LEVEL SECURITY;

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals FORCE ROW LEVEL SECURITY;

-- Physical audit table in this project is sdaia_audit_logs
ALTER TABLE sdaia_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdaia_audit_logs FORCE ROW LEVEL SECURITY;

-- Compatibility name requested by product: audit_logs → same rows
CREATE OR REPLACE VIEW audit_logs AS
  SELECT * FROM sdaia_audit_logs;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS thread_org_isolation ON session_threads;
CREATE POLICY thread_org_isolation ON session_threads
  FOR ALL
  USING (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
  )
  WITH CHECK (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
  );

DROP POLICY IF EXISTS memory_org_isolation ON scope_memories;
CREATE POLICY memory_org_isolation ON scope_memories
  FOR ALL
  USING (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
  )
  WITH CHECK (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
  );

DROP POLICY IF EXISTS approval_org_isolation ON pending_approvals;
CREATE POLICY approval_org_isolation ON pending_approvals
  FOR ALL
  USING (
    scope_id IS NULL
    OR scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
    OR requester_id = app.current_user_id()
  )
  WITH CHECK (
    scope_id IS NULL
    OR scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
    OR requester_id = app.current_user_id()
  );

DROP POLICY IF EXISTS audit_org_isolation ON sdaia_audit_logs;
CREATE POLICY audit_org_isolation ON sdaia_audit_logs
  FOR ALL
  USING (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
    OR user_id = app.current_user_id()
  )
  WITH CHECK (
    scope_id IN (
      SELECT scope_id FROM scope_permissions
      WHERE user_id = app.current_user_id()
         OR org_id = COALESCE(app.current_org_id(), NULLIF(current_setting('app.current_org_id', true), ''))
    )
    OR user_id = app.current_user_id()
  );

-- Seed helper org for local/dev demos (idempotent)
INSERT INTO organizations (id, name)
VALUES ('org-demo', 'Arabic Buzz Demo Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_members (id, user_id, org_id, role)
VALUES ('om-demo-owner', 'user-1', 'org-demo', 'OWNER')
ON CONFLICT (user_id, org_id) DO NOTHING;

INSERT INTO scope_permissions (id, scope_id, user_id, org_id)
VALUES
  ('sp-demo-shared-user', 'shared-demo', 'user-1', NULL),
  ('sp-demo-shared-org', 'shared-demo', NULL, 'org-demo')
ON CONFLICT (id) DO NOTHING;
