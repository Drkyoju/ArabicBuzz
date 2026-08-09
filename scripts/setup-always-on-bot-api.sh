#!/usr/bin/env bash
# Optional: start Local Telegram Bot API on an always-on host (VPS / desktop that does not sleep).
# Does NOT create cloud accounts or store secrets — you supply API_ID/HASH from my.telegram.org.
#
# Usage:
#   export TELEGRAM_API_ID=…
#   export TELEGRAM_API_HASH=…
#   ./scripts/setup-always-on-bot-api.sh
#
# Then tunnel 127.0.0.1:8081 → HTTPS and set on CranL:
#   TELEGRAM_BOT_API_URL=https://your-public-host
#
# Mac + OrbStack still works when the laptop is awake, but is NOT 24/7.
# Docs: docs/telegram-always-on-bot-api.md

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/telegram-bot-api"

if [[ -z "${TELEGRAM_API_ID:-}" || -z "${TELEGRAM_API_HASH:-}" ]]; then
  echo "Set TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found — install Docker or OrbStack on this host first." >&2
  exit 1
fi

cd "$COMPOSE_DIR"
docker compose up -d

echo ""
echo "Local Bot API should listen on 127.0.0.1:8081"
echo "Next:"
echo "  1) Expose HTTPS → 8081 (Cloudflare Tunnel / Caddy / nginx / Tailscale)"
echo "  2) CranL env: TELEGRAM_BOT_API_URL=https://…  (no trailing slash)"
echo "  3) Optional Mac: MAC_SYNC_URL + MAC_SYNC_SECRET when laptop is on"
echo "  4) Bot /status shows which hops are up"
echo ""
echo "See docs/telegram-always-on-bot-api.md"
