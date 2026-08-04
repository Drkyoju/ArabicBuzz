-- Room home dashboard history: edits, presence, Zoom sessions.
CREATE TABLE IF NOT EXISTS room_activity_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'edit'
    CHECK (kind IN ('edit', 'message', 'canvas', 'presence', 'zoom', 'system')),
  actor_ar TEXT NOT NULL,
  actor_email TEXT,
  action_ar TEXT NOT NULL,
  detail_ar TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_activity_log_scope_idx
  ON room_activity_log (scope_id, created_at DESC);

CREATE TABLE IF NOT EXISTS zoom_session_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL DEFAULT 'shared-demo',
  meeting_id TEXT NOT NULL,
  topic TEXT,
  join_url TEXT,
  host_email TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  live BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS zoom_session_log_live_uniq
  ON zoom_session_log (scope_id, meeting_id)
  WHERE live = true;

CREATE INDEX IF NOT EXISTS zoom_session_log_scope_idx
  ON zoom_session_log (scope_id, last_seen_at DESC);

ALTER TABLE room_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_session_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_activity_log_all ON room_activity_log;
CREATE POLICY room_activity_log_all ON room_activity_log
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS zoom_session_log_all ON zoom_session_log;
CREATE POLICY zoom_session_log_all ON zoom_session_log
  FOR ALL USING (true) WITH CHECK (true);
