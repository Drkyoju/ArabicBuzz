-- One-level reply threading on room chat + index for parent lookups.
ALTER TABLE room_posts
  ADD COLUMN IF NOT EXISTS parent_post_id text REFERENCES room_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS room_posts_parent_idx
  ON room_posts (parent_post_id)
  WHERE parent_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS room_posts_scope_parent_created_idx
  ON room_posts (scope_id, parent_post_id, created_at);
