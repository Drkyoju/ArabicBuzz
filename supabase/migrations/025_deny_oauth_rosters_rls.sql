-- Explicit deny for sensitive tables that previously relied on "RLS on, no policies".

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'google_oauth_tokens'
  ) THEN
    ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;
    ALTER TABLE google_oauth_tokens FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS google_oauth_tokens_deny_clients ON google_oauth_tokens;
    CREATE POLICY google_oauth_tokens_deny_clients ON google_oauth_tokens
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_agent_rosters'
  ) THEN
    ALTER TABLE user_agent_rosters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_agent_rosters FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_agent_rosters_deny_clients ON user_agent_rosters;
    CREATE POLICY user_agent_rosters_deny_clients ON user_agent_rosters
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;
