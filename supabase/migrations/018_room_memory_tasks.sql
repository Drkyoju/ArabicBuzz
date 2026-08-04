-- Shared room memory — belongs to the scope, not one browser/account.
CREATE TABLE IF NOT EXISTS room_memories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  created_by_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_memories_scope_idx ON room_memories (scope_id, created_at DESC);

-- Shared room tasks / orders board — AI can reorder and reschedule.
CREATE TABLE IF NOT EXISTS room_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  notes_ar TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
  due_at TIMESTAMPTZ,
  assignee_ar TEXT,
  assignee_email TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai', 'email', 'chat')),
  created_by TEXT,
  created_by_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_tasks_scope_sort_idx
  ON room_tasks (scope_id, sort_order, due_at);

ALTER TABLE room_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_memories_all ON room_memories;
CREATE POLICY room_memories_all ON room_memories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS room_tasks_all ON room_tasks;
CREATE POLICY room_tasks_all ON room_tasks FOR ALL USING (true) WITH CHECK (true);
