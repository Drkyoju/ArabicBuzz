-- Shared room calendar — belongs to the scope/room, not one person's Google account.
CREATE TABLE IF NOT EXISTS room_calendar_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location_ar TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai', 'email', 'import', 'google_sync')),
  created_by TEXT,
  created_by_ar TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  google_event_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_calendar_events_scope_starts_idx
  ON room_calendar_events (scope_id, starts_at);

CREATE INDEX IF NOT EXISTS room_calendar_events_scope_status_idx
  ON room_calendar_events (scope_id, status);

ALTER TABLE room_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_calendar_events_read ON room_calendar_events;
CREATE POLICY room_calendar_events_read ON room_calendar_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS room_calendar_events_write ON room_calendar_events;
CREATE POLICY room_calendar_events_write ON room_calendar_events
  FOR ALL USING (true) WITH CHECK (true);
