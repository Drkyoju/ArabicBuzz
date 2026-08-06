-- Google Calendar → shared room calendar sync (opt-in per member).
-- Mirrored events use source='google_sync' + google_event_id for dedupe.

ALTER TABLE room_members
  ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN room_members.calendar_sync_enabled IS
  'When true, upcoming Google Calendar events for this member are mirrored into the room shared calendar.';

-- Deduplicate mirrored Google events per room (raw or email::id scoped ids).
CREATE UNIQUE INDEX IF NOT EXISTS room_calendar_events_scope_google_uidx
  ON room_calendar_events (scope_id, google_event_id)
  WHERE google_event_id IS NOT NULL AND google_event_id <> '';

CREATE INDEX IF NOT EXISTS room_members_calendar_sync_idx
  ON room_members (scope_id)
  WHERE calendar_sync_enabled = true;
