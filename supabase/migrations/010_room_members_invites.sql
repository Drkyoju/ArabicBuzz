-- Human room members + invite tokens (share links)
CREATE TABLE IF NOT EXISTS room_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  user_id TEXT,
  email TEXT,
  display_name_ar TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'member', 'guest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_id, email)
);

CREATE INDEX IF NOT EXISTS room_members_scope_idx ON room_members (scope_id);

ALTER TABLE room_invites
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS display_name_ar TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS room_invites_token_uidx
  ON room_invites (token)
  WHERE token IS NOT NULL;

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_members_read ON room_members;
CREATE POLICY room_members_read ON room_members FOR SELECT USING (true);

DROP POLICY IF EXISTS room_members_write ON room_members;
CREATE POLICY room_members_write ON room_members FOR ALL USING (true) WITH CHECK (true);
