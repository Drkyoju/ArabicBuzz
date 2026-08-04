-- Persisted remote MCP connections (reconnect after Netlify cold start).
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  url TEXT NOT NULL,
  catalog_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mcp_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_connections_all ON mcp_connections;
CREATE POLICY mcp_connections_all ON mcp_connections
  FOR ALL USING (true) WITH CHECK (true);
