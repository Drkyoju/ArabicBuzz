#!/usr/bin/env bash
# Start / restart Mac sync agent + print tunnel reconnect steps.
# Usage:
#   ./scripts/restart-mac-sync.sh
#   ./scripts/restart-mac-sync.sh --with-tunnel   # also launch cloudflared quick tunnel if binary present

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MAC_SYNC_PORT:-7420}"
SECRET="${MAC_SYNC_SECRET:-}"
if [[ -z "$SECRET" && -f .env.local ]]; then
  SECRET="$(grep -E '^MAC_SYNC_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  PORT_FROM_ENV="$(grep -E '^MAC_SYNC_PORT=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -n "${PORT_FROM_ENV:-}" ]]; then PORT="$PORT_FROM_ENV"; fi
fi
if [[ -z "$SECRET" && -f .env.cranl.local ]]; then
  SECRET="$(grep -E '^MAC_SYNC_SECRET=' .env.cranl.local | head -1 | cut -d= -f2- | tr -d '\r' || true)"
fi
if [[ -z "$SECRET" ]]; then
  echo "⚠️  MAC_SYNC_SECRET missing — refusing to invent a new one (would break CranL)." >&2
  echo "    Set MAC_SYNC_SECRET in the environment or .env.local to match CranL." >&2
  exit 1
fi
export MAC_SYNC_SECRET="$SECRET"
export MAC_SYNC_PORT="$PORT"
export LOCAL_STORAGE_ROOT="${LOCAL_STORAGE_ROOT:-$HOME/ArabicBuzz/data}"
mkdir -p "$LOCAL_STORAGE_ROOT"

echo "════════════════════════════════════════"
echo " Arabic Buzz · restart storage:sync"
echo "════════════════════════════════════════"

# Stop prior agent on this port (best-effort)
if command -v lsof >/dev/null 2>&1; then
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${pids:-}" ]]; then
    echo "Stopping listeners on :$PORT → $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
fi
pkill -f 'scripts/mac-sync-agent.ts' 2>/dev/null || true
sleep 0.5

echo "Starting agent on 127.0.0.1:$PORT …"
nohup env MAC_SYNC_SECRET="$SECRET" MAC_SYNC_PORT="$PORT" npm run storage:sync \
  >/tmp/ab-mac-sync-agent.log 2>&1 &
AGENT_PID=$!
echo "agent pid=$AGENT_PID (log: /tmp/ab-mac-sync-agent.log)"

# Health wait
ok=0
for i in 1 2 3 4 5 6 7 8; do
  if curl -sf -m 2 -H "Authorization: Bearer $SECRET" "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -eq 1 ]]; then
  echo "✅ /health OK"
else
  echo "⚠️  /health not ready yet — see /tmp/ab-mac-sync-agent.log" >&2
fi

TUNNEL_URL=""
if [[ "${1:-}" == "--with-tunnel" ]]; then
  CF_BIN=""
  for c in /tmp/cloudflared cloudflared "$(command -v cloudflared 2>/dev/null || true)"; do
    if [[ -n "$c" && -x "$c" ]]; then CF_BIN="$c"; break; fi
  done
  if [[ -n "$CF_BIN" ]]; then
    pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
    sleep 0.5
    nohup "$CF_BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate \
      >/tmp/ab-cloudflared-7420.log 2>&1 &
    echo "cloudflared pid=$! (log: /tmp/ab-cloudflared-7420.log)"
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
      TUNNEL_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' /tmp/ab-cloudflared-7420.log 2>/dev/null | tail -1 || true)
      if [[ -n "$TUNNEL_URL" ]]; then break; fi
      sleep 1
    done
  else
    echo "cloudflared not found — use: npx ngrok http $PORT"
  fi
fi

echo ""
echo "CranL / Netlify (update when tunnel URL changes):"
echo "  MAC_SYNC_URL=${TUNNEL_URL:-<https-tunnel>}"
echo "  MAC_SYNC_SECRET=$SECRET"
echo "  NEXT_PUBLIC_MAC_UPLOAD_URL=${TUNNEL_URL:-<https-tunnel>}"
echo ""
echo "Reconnect notes:"
echo "  • Quick tunnels (trycloudflare) die on Mac sleep / network change — re-run this script."
echo "  • If QUIC blocked: try ngrok, or named Cloudflare tunnel, or set TELEGRAM_BOT_API_URL on a VPS."
echo "  • Bot /status shows جسر الماك hop live."
echo "  • OrbStack pin: ./scripts/pin-orbstack-1.5.1.sh"
echo "════════════════════════════════════════"

# Keep foreground only if --foreground
if [[ "${1:-}" == "--foreground" || "${2:-}" == "--foreground" ]]; then
  wait "$AGENT_PID"
fi
