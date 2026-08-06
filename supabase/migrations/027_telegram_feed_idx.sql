-- Index for home Telegram mirror window (filter room_posts by channel).
CREATE INDEX IF NOT EXISTS room_posts_telegram_feed_idx
  ON room_posts (scope_id, created_at DESC)
  WHERE channel = 'telegram';
