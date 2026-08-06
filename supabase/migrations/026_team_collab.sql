-- Team collab MVP: task comments, item acks (قرارات/محاضر), post kind, mention users.
-- Apply via npm run setup:supabase (or Supabase SQL editor). Service role bypasses RLS.

-- Short comments on room tasks
CREATE TABLE IF NOT EXISTS room_task_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  author_id TEXT,
  author_ar TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_task_comments_task_idx
  ON room_task_comments (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS room_task_comments_scope_idx
  ON room_task_comments (scope_id, created_at DESC);

ALTER TABLE room_task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_task_comments_deny_all ON room_task_comments;
CREATE POLICY room_task_comments_deny_all ON room_task_comments
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Lightweight «اطّلعت» receipts for decisions / minutes (not every chat message)
CREATE TABLE IF NOT EXISTS room_item_acks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('post', 'canvas')),
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_ar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_kind, item_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_item_acks_item_idx
  ON room_item_acks (item_kind, item_id);
CREATE INDEX IF NOT EXISTS room_item_acks_scope_idx
  ON room_item_acks (scope_id, created_at DESC);

ALTER TABLE room_item_acks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_item_acks_deny_all ON room_item_acks;
CREATE POLICY room_item_acks_deny_all ON room_item_acks
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Post classification: chat | decision | minutes
ALTER TABLE room_posts
  ADD COLUMN IF NOT EXISTS post_kind TEXT NOT NULL DEFAULT 'chat';

ALTER TABLE room_posts
  ADD COLUMN IF NOT EXISTS mention_user_ids TEXT;

-- Optional stable assignee link (email/name still used for display)
ALTER TABLE room_tasks
  ADD COLUMN IF NOT EXISTS assignee_user_id TEXT;

CREATE INDEX IF NOT EXISTS room_posts_kind_idx
  ON room_posts (scope_id, post_kind)
  WHERE post_kind IN ('decision', 'minutes');
