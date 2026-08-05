#!/usr/bin/env bash
# Deploy MCP Toolbox to Railway (Docker). Requires railway CLI + login/token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. Install: npm i -g @railway/cli" >&2
  echo "  Then: railway login   (or export RAILWAY_TOKEN=…)" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing .env — run: ./scripts/env-from-database-url.sh" >&2
  exit 1
fi

# Link or init project interactively if needed
railway status >/dev/null 2>&1 || railway init

railway up --detach

echo
echo "After Railway assigns a public HTTPS domain, set Netlify:"
echo "  MCP_TOOLBOX_URL=https://<railway-domain>/mcp"
echo "Ensure start command / Dockerfile exposes port 5000 with:"
echo "  --prebuilt postgres/data --address 0.0.0.0 --port 5000"
