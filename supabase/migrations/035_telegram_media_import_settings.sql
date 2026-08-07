-- Per-scope toggle: auto-import Telegram media (docs/voice/photo/video) into
-- the room vault / Drive. Plain text stays in the live Telegram pane only.
CREATE TABLE IF NOT EXISTS scope_telegram_settings (
  scope_id TEXT PRIMARY KEY,
  media_import BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scope_telegram_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scope_telegram_settings_all ON scope_telegram_settings;
CREATE POLICY scope_telegram_settings_all ON scope_telegram_settings
  FOR ALL USING (true) WITH CHECK (true);
