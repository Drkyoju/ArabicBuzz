#!/usr/bin/env bash
# One-command Local Telegram Bot API (VPS always-on OR Mac OrbStack while awake).
# Does NOT invent secrets — loads TELEGRAM_API_ID/HASH from env or .env.local / deploy/.env
#
# Usage:
#   npm run telegram:bot-api-setup
#   # or: ./scripts/setup-always-on-bot-api.sh
#
# Then tunnel 127.0.0.1:8081 → HTTPS and set on CranL:
#   TELEGRAM_BOT_API_URL=https://your-public-host
#
# Mac + OrbStack is NOT 24/7 — pin: ./scripts/pin-orbstack-1.5.1.sh
# Docs: docs/telegram-always-on-bot-api.md

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/telegram-bot-api"

load_dotenv() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  # shellcheck disable=SC1090
  set -a
  source <(grep -E '^(TELEGRAM_API_ID|TELEGRAM_API_HASH|TELEGRAM_BOT_TOKEN)=' "$f" | sed 's/\r$//' || true)
  set +a
}

load_dotenv "$ROOT/.env.local"
load_dotenv "$ROOT/.env"
load_dotenv "$COMPOSE_DIR/.env"

if [[ -z "${TELEGRAM_API_ID:-}" || -z "${TELEGRAM_API_HASH:-}" ]]; then
  echo "Set TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org" >&2
  echo "Template: deploy/telegram-bot-api/.env.example" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found — install Docker or OrbStack on this host first." >&2
  exit 1
fi

# Persist for compose variable substitution
cat >"$COMPOSE_DIR/.env" <<EOF
TELEGRAM_API_ID=${TELEGRAM_API_ID}
TELEGRAM_API_HASH=${TELEGRAM_API_HASH}
EOF

cd "$COMPOSE_DIR"
docker compose up -d

echo ""
echo "Waiting for 127.0.0.1:8081 …"
ready=0
for _ in $(seq 1 20); do
  if curl -sf -m 2 "http://127.0.0.1:8081/" >/dev/null 2>&1 \
    || curl -sf -m 2 "http://127.0.0.1:8081/bot${TELEGRAM_BOT_TOKEN:-x}/getMe" >/dev/null 2>&1; then
    ready=1
    break
  fi
  # Bot API returns JSON 404 on / — any TCP response counts
  if curl -sS -m 2 "http://127.0.0.1:8081/" 2>/dev/null | grep -q 'ok\|error_code\|Not Found'; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -eq 1 ]]; then
  echo "✅ Local Bot API listening on 127.0.0.1:8081"
else
  echo "⚠️  Port 8081 not confirmed — check: docker compose -f $COMPOSE_DIR/docker-compose.yml logs" >&2
fi

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  me=$(curl -sS -m 5 "http://127.0.0.1:8081/bot${TELEGRAM_BOT_TOKEN}/getMe" 2>/dev/null || true)
  if echo "$me" | grep -q '"ok":true'; then
    echo "✅ getMe OK via local Bot API"
  else
    echo "⚠️  getMe not ready yet (TDLib may still be initializing) — retry in ~30s"
  fi
fi

# Best-effort OrbStack pin on Mac
if [[ "$(uname -s)" == "Darwin" ]]; then
  bash "$ROOT/scripts/pin-orbstack-1.5.1.sh" || true
fi

echo ""
echo "Next (failover order in code):"
echo "  1) Expose HTTPS → 8081 (Cloudflare Tunnel / Caddy / nginx / Tailscale Funnel)"
echo "  2) CranL env: TELEGRAM_BOT_API_URL=https://…  (no trailing slash) ← 24/7 path"
echo "  3) Mac awake fallback: npm run storage:sync:up → MAC_SYNC_URL + MAC_SYNC_SECRET"
echo "  4) Bot /status — hops: Local Bot API · جسر الماك · MTProto · غرفة/Drive"
echo ""
echo "See docs/telegram-always-on-bot-api.md"
