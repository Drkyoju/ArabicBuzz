#!/usr/bin/env bash
# One-shot Mac hop health check — prints hop_health=ok|degraded and exits 0/1.
# Usage:
#   ./scripts/mac-hop-health.sh           # run one watchdog pass + report
#   ./scripts/mac-hop-health.sh --quick   # ports only (no heal/PUT)
#   npm run mac-hop:health

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT_SYNC="${MAC_SYNC_PORT:-7420}"
PORT_BOTAPI="${TELEGRAM_BOT_API_PORT:-8081}"
QUICK=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
  esac
done

port_up() {
  local p="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$p" >/dev/null 2>&1
  else
    (echo >/dev/tcp/127.0.0.1/"$p") >/dev/null 2>&1
  fi
}

echo "=== Mac hop health ==="
echo "ports: Local Bot API :$PORT_BOTAPI · storage:sync :$PORT_SYNC"

bot_ok=0
sync_ok=0
port_up "$PORT_BOTAPI" && bot_ok=1
port_up "$PORT_SYNC" && sync_ok=1
echo "  :$PORT_BOTAPI → $([ "$bot_ok" -eq 1 ] && echo up || echo down)"
echo "  :$PORT_SYNC → $([ "$sync_ok" -eq 1 ] && echo up || echo down)"

if [[ "$QUICK" -eq 1 ]]; then
  if [[ "$bot_ok" -eq 1 && "$sync_ok" -eq 1 ]]; then
    echo "hop_health=ok"
    exit 0
  fi
  echo "hop_health=degraded" >&2
  exit 1
fi

# Heal once via watchdog (may start docker/tunnels; no --force-put by default)
set +e
out="$(bash "$ROOT/scripts/mac-hop-watchdog.sh" 2>&1)"
rc=$?
set -e
echo "$out" | tail -40

if echo "$out" | grep -q 'hop_health=ok'; then
  echo "hop_health=ok"
  exit 0
fi

# Fallback: re-check ports after watchdog
port_up "$PORT_BOTAPI" && bot_ok=1 || bot_ok=0
port_up "$PORT_SYNC" && sync_ok=1 || sync_ok=0
if [[ "$bot_ok" -eq 1 && "$sync_ok" -eq 1 && "$rc" -eq 0 ]]; then
  echo "hop_health=ok"
  exit 0
fi

echo "hop_health=degraded" >&2
echo "tips: npm run mac-hop:install · plug AC · keep Mac awake · OrbStack 1.5.1 only" >&2
exit 1
