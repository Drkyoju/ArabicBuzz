#!/usr/bin/env bash
# One-shot Mac vault helper for Arabic Buzz.
# Starts the local sync agent and prints Netlify env values.
# Requires a public tunnel (ngrok / cloudflared) for Netlify to reach your Mac.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MAC_SYNC_PORT:-7420}"
SECRET="${MAC_SYNC_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  SECRET="ab-$(openssl rand -hex 12)"
fi

export MAC_SYNC_SECRET="$SECRET"
export MAC_SYNC_PORT="$PORT"
export LOCAL_STORAGE_ROOT="${LOCAL_STORAGE_ROOT:-$HOME/ArabicBuzz/data}"
mkdir -p "$LOCAL_STORAGE_ROOT"

echo "════════════════════════════════════════"
echo " Arabic Buzz · Mac sync"
echo "════════════════════════════════════════"
echo " Vault:  $LOCAL_STORAGE_ROOT"
echo " Port:   $PORT"
echo " Secret: $SECRET"
echo ""
echo "1) Keep this agent running:"
echo "   MAC_SYNC_SECRET=$SECRET MAC_SYNC_PORT=$PORT npm run storage:sync"
echo ""
echo "2) In another terminal, expose the port:"
echo "   npx --yes ngrok http $PORT"
echo "   # or: cloudflared tunnel --url http://127.0.0.1:$PORT"
echo ""
echo "3) Copy the https URL into Netlify:"
echo "   MAC_SYNC_URL=<https-tunnel>"
echo "   MAC_SYNC_SECRET=$SECRET"
echo "   NEXT_PUBLIC_MAC_UPLOAD_URL=<https-tunnel>"
echo "   BRAIN_PRIMARY=mac"
echo "   Then Redeploy."
echo "════════════════════════════════════════"
echo ""

exec env MAC_SYNC_SECRET="$SECRET" MAC_SYNC_PORT="$PORT" npm run storage:sync
