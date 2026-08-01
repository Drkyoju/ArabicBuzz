-- Encrypted provider API keys saved from the settings UI (QM-style).
CREATE TABLE IF NOT EXISTS provider_api_keys (
  env_name TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
