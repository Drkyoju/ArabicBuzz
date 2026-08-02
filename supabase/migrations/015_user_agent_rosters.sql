-- Per-user agent roster (custom agents, seating, collab mode, builtin overrides)
-- Apply: npx prisma db execute --file supabase/migrations/015_user_agent_rosters.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS user_agent_rosters (
  user_id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_agent_rosters_updated_idx
  ON user_agent_rosters (updated_at DESC);
