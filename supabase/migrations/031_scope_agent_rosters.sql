-- Room-scoped agent roster (shared seats for all members of a team room)
-- Apply: npx prisma db execute --file supabase/migrations/031_scope_agent_rosters.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS scope_agent_rosters (
  scope_id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scope_agent_rosters_updated_idx
  ON scope_agent_rosters (updated_at DESC);
