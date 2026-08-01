-- Editor / viewer roles for room members + soft archive flag on personal scopes (client-side; DB for members)
-- Expand room_members.role CHECK to include editor + viewer.

ALTER TABLE room_members DROP CONSTRAINT IF EXISTS room_members_role_check;

ALTER TABLE room_members
  ADD CONSTRAINT room_members_role_check
  CHECK (role IN ('owner', 'editor', 'member', 'viewer', 'guest'));

-- Canvas edit audit helper view (optional reads)
CREATE TABLE IF NOT EXISTS room_canvas_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  title_ar TEXT,
  actor_id TEXT,
  actor_ar TEXT,
  action TEXT NOT NULL DEFAULT 'update',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_canvas_audit_scope_idx
  ON room_canvas_audit (scope_id, created_at DESC);

ALTER TABLE room_canvas_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_canvas_audit_read ON room_canvas_audit;
CREATE POLICY room_canvas_audit_read ON room_canvas_audit FOR SELECT USING (true);
DROP POLICY IF EXISTS room_canvas_audit_write ON room_canvas_audit;
CREATE POLICY room_canvas_audit_write ON room_canvas_audit FOR ALL USING (true) WITH CHECK (true);
