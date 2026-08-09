#!/usr/bin/env bash
# Start / restart Mac sync agent + optional cloudflared tunnel + CranL URL PUT.
# Usage:
#   ./scripts/restart-mac-sync.sh
#   ./scripts/restart-mac-sync.sh --with-tunnel          # tunnel + CranL PUT (default)
#   ./scripts/restart-mac-sync.sh --with-tunnel --no-put # local tunnel only
#   ./scripts/restart-mac-sync.sh --foreground

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_TUNNEL=0
NO_PUT=0
FOREGROUND=0
for arg in "$@"; do
  case "$arg" in
    --with-tunnel) WITH_TUNNEL=1 ;;
    --no-put) NO_PUT=1 ;;
    --foreground) FOREGROUND=1 ;;
  esac
done

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

LOG_DIR="${HOME}/Library/Logs/ArabicBuzz"
mkdir -p "$LOG_DIR"
AGENT_LOG="/tmp/ab-mac-sync-agent.log"
TUNNEL_LOG="$LOG_DIR/ab-cloudflared-mac-sync.log"
# Keep /tmp symlink for older muscle-memory
ln -sf "$TUNNEL_LOG" /tmp/ab-cloudflared-7420.log 2>/dev/null || true

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
  >"$AGENT_LOG" 2>&1 &
AGENT_PID=$!
echo "agent pid=$AGENT_PID (log: $AGENT_LOG)"

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
  echo "⚠️  /health not ready yet — see $AGENT_LOG" >&2
fi

TUNNEL_URL=""
if [[ "$WITH_TUNNEL" -eq 1 ]]; then
  CF_BIN=""
  if CF_BIN="$("$ROOT/scripts/ensure-cloudflared.sh" 2>/dev/null)"; then
    :
  else
    CF_BIN=""
  fi
  if [[ -z "$CF_BIN" || ! -x "$CF_BIN" ]]; then
    for c in "$HOME/bin/cloudflared" /usr/local/bin/cloudflared /opt/homebrew/bin/cloudflared /tmp/cloudflared "$(command -v cloudflared 2>/dev/null || true)"; do
      if [[ -n "$c" && -x "$c" ]]; then CF_BIN="$c"; break; fi
    done
  fi
  if [[ -n "$CF_BIN" ]]; then
    pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
    sleep 0.5
    : >"$TUNNEL_LOG"
    # Prefer HTTP/2 first when QUIC is flaky on some networks; cloudflared falls back.
    nohup "$CF_BIN" tunnel --url "http://127.0.0.1:$PORT" --protocol http2 --no-autoupdate \
      >>"$TUNNEL_LOG" 2>&1 &
    echo "cloudflared pid=$! (log: $TUNNEL_LOG)"
    for i in $(seq 1 20); do
      TUNNEL_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true)
      if [[ -n "$TUNNEL_URL" ]]; then break; fi
      sleep 1
    done
    # Retry once with default protocol if http2 never printed a URL
    if [[ -z "$TUNNEL_URL" ]]; then
      echo "http2 tunnel slow — retrying default protocol…" >&2
      pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
      sleep 0.5
      : >"$TUNNEL_LOG"
      nohup "$CF_BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate \
        >>"$TUNNEL_LOG" 2>&1 &
      for i in $(seq 1 20); do
        TUNNEL_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true)
        if [[ -n "$TUNNEL_URL" ]]; then break; fi
        sleep 1
      done
    fi
  else
    echo "cloudflared not found — run: ./scripts/ensure-cloudflared.sh" >&2
    echo "  or: npx ngrok http $PORT" >&2
  fi
fi

echo ""
echo "CranL env (update when tunnel URL changes):"
echo "  MAC_SYNC_URL=${TUNNEL_URL:-<https-tunnel>}"
echo "  MAC_SYNC_SECRET=$SECRET"
echo "  NEXT_PUBLIC_MAC_UPLOAD_URL=${TUNNEL_URL:-<https-tunnel>}"
echo ""

if [[ "$WITH_TUNNEL" -eq 1 && -n "$TUNNEL_URL" && "$NO_PUT" -eq 0 ]]; then
  if [[ -x "$ROOT/scripts/cranl-put-env-keys.sh" ]]; then
    echo "Updating CranL MAC_SYNC_URL…"
    if "$ROOT/scripts/cranl-put-env-keys.sh" --restart \
      "MAC_SYNC_URL=$TUNNEL_URL" \
      "NEXT_PUBLIC_MAC_UPLOAD_URL=$TUNNEL_URL"; then
      echo "✅ CranL MAC_SYNC_URL refreshed"
    else
      echo "⚠️  CranL PUT failed — tunnel is live locally; retry: npm run mac-hop:watchdog:force" >&2
    fi
  else
    echo "⚠️  cranl-put-env-keys.sh missing — set MAC_SYNC_URL manually or: npm run mac-hop:watchdog:force" >&2
  fi
elif [[ "$WITH_TUNNEL" -eq 1 && -n "$TUNNEL_URL" && "$NO_PUT" -eq 1 ]]; then
  echo "(--no-put) Skipped CranL update. When ready: npm run mac-hop:watchdog:force"
fi

echo ""
echo "Reconnect notes:"
echo "  • Preferred always-on while Mac awake: npm run mac-hop:install"
echo "  • Emergency heal: npm run mac-hop:watchdog:force  (agent + tunnel + CranL PUT)"
echo "  • Quick tunnels die on sleep / network change — re-run this or the watchdog."
echo "  • Bot /status shows جسر الماك hop live."
echo "════════════════════════════════════════"

if [[ "$FOREGROUND" -eq 1 ]]; then
  wait "$AGENT_PID"
fi
