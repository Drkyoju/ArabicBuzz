-- Per-agent / per-day token usage for owner dashboard
CREATE TABLE IF NOT EXISTS token_usage_daily (
  id TEXT PRIMARY KEY,
  day_key TEXT NOT NULL,
  scope_id TEXT NOT NULL DEFAULT 'shared-demo',
  agent_id TEXT NOT NULL DEFAULT 'unknown',
  agent_name_ar TEXT NOT NULL DEFAULT 'وكيل',
  model_slug TEXT NOT NULL DEFAULT '',
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  runs INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS token_usage_daily_uniq
  ON token_usage_daily (day_key, scope_id, agent_id, model_slug);

CREATE INDEX IF NOT EXISTS token_usage_daily_day_idx
  ON token_usage_daily (day_key DESC);

ALTER TABLE token_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_usage_daily_service ON token_usage_daily;
CREATE POLICY token_usage_daily_service ON token_usage_daily
  FOR ALL USING (true) WITH CHECK (true);
