-- Association registry + committee Telegram channels + member profile fields
ALTER TABLE room_members
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS committee TEXT,
  ADD COLUMN IF NOT EXISTS notes_ar TEXT;

CREATE TABLE IF NOT EXISTS room_committee_channels (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  committee_key TEXT NOT NULL
    CHECK (committee_key IN ('finance', 'programs', 'board')),
  name_ar TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_id, committee_key)
);

CREATE INDEX IF NOT EXISTS room_committee_channels_scope_idx
  ON room_committee_channels (scope_id);

ALTER TABLE room_committee_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_committee_channels_read ON room_committee_channels;
CREATE POLICY room_committee_channels_read ON room_committee_channels
  FOR SELECT USING (true);

DROP POLICY IF EXISTS room_committee_channels_write ON room_committee_channels;
CREATE POLICY room_committee_channels_write ON room_committee_channels
  FOR ALL USING (true) WITH CHECK (true);
