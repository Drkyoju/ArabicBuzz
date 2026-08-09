#!/usr/bin/env bash
# One-shot Mac vault helper for Arabic Buzz.
# Starts the local sync agent and prints CranL reconnect steps.
# Prefer durable path: npm run mac-hop:install (watchdog refreshes MAC_SYNC_URL).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MAC_SYNC_PORT:-7420}"
SECRET="${MAC_SYNC_SECRET:-}"
ROTATE=0
for arg in "$@"; do
  case "$arg" in
    --rotate-secret) ROTATE=1 ;;
  esac
done

if [[ -z "$SECRET" && -f .env.local ]]; then
  SECRET="$(grep -E '^MAC_SYNC_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' || true)"
fi
if [[ -z "$SECRET" && -f .env.cranl.local ]]; then
  SECRET="$(grep -E '^MAC_SYNC_SECRET=' .env.cranl.local | head -1 | cut -d= -f2- | tr -d '\r' || true)"
fi

if [[ -z "$SECRET" || "$ROTATE" -eq 1 ]]; then
  if [[ -z "$SECRET" ]]; then
    echo "⚠️  MAC_SYNC_SECRET missing." >&2
    echo "    Refusing to invent a secret that would desync CranL." >&2
    echo "    Set MAC_SYNC_SECRET in .env.local to match CranL, or pass --rotate-secret" >&2
    echo "    and then: npm run cranl:put-env MAC_SYNC_SECRET=…" >&2
    exit 1
  fi
  if [[ "$ROTATE" -eq 1 ]]; then
    SECRET="ab-$(openssl rand -hex 12)"
    echo "Rotated MAC_SYNC_SECRET locally — you MUST push it to CranL:" >&2
    echo "  npm run cranl:put-env -- MAC_SYNC_SECRET=$SECRET" >&2
  fi
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
echo " Secret: (set — matches local env; do not invent a second one)"
echo ""
echo "Preferred (auto tunnel + CranL PUT while Mac awake):"
echo "  npm run mac-hop:install"
echo "  npm run mac-hop:watchdog:force   # emergency heal"
echo "  Keep AC plugged + lid open (sleep kills trycloudflare)"
echo ""
echo "Manual one-shot:"
echo "  npm run storage:sync:up          # agent + cloudflared + CranL PUT"
echo ""
echo "Foreground agent only (this script):"
echo "  MAC_SYNC_SECRET=… MAC_SYNC_PORT=$PORT npm run storage:sync"
echo "════════════════════════════════════════"
echo ""

exec env MAC_SYNC_SECRET="$SECRET" MAC_SYNC_PORT="$PORT" npm run storage:sync
