#!/usr/bin/env bash
# Lightweight Mac tunnel wake monitor — NOT a 24/7 convert server.
# Checks published MAC_SYNC_URL (+ optional Bot API tunnel). If dead after wake/sleep,
# re-runs mac-hop-watchdog (heal + CranL PUT) and logs an alert.
#
# Usage:
#   npm run mac-tunnel:wake-monitor
#   ./scripts/mac-tunnel-wake-monitor.sh
#   ./scripts/mac-tunnel-wake-monitor.sh --loop   # every 3 min (optional launchd)
#   ./scripts/mac-tunnel-wake-monitor.sh --once
#
# Reuses: scripts/mac-hop-watchdog.sh · scripts/mac-hop-health.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOOP=0
INTERVAL="${AB_TUNNEL_WAKE_INTERVAL:-180}"
STATE_DIR="${AB_HOP_STATE_DIR:-$HOME/Library/Application Support/ArabicBuzz/hop}"
LOG_DIR="${AB_HOP_LOG_DIR:-$HOME/Library/Logs/ArabicBuzz}"
mkdir -p "$STATE_DIR" "$LOG_DIR"

for arg in "$@"; do
  case "$arg" in
    --loop) LOOP=1 ;;
    --once) LOOP=0 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

load_dotenv_key() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//' || true
}

SECRET="${MAC_SYNC_SECRET:-}"
[[ -z "$SECRET" ]] && SECRET="$(load_dotenv_key MAC_SYNC_SECRET .env.local)"
[[ -z "$SECRET" ]] && SECRET="$(load_dotenv_key MAC_SYNC_SECRET .env.cranl.local)"

resolve_mac_sync_url() {
  local u=""
  u="${MAC_SYNC_URL:-}"
  [[ -z "$u" && -f "$STATE_DIR/mac_sync_url" ]] && u="$(cat "$STATE_DIR/mac_sync_url" 2>/dev/null || true)"
  [[ -z "$u" ]] && u="$(load_dotenv_key MAC_SYNC_URL .env.local)"
  [[ -z "$u" ]] && u="$(load_dotenv_key MAC_SYNC_URL .env.cranl.local)"
  echo "$u"
}

tunnel_ok() {
  local url="$1"
  [[ -n "$url" && "$url" == https://* ]] || return 1
  [[ -n "$SECRET" ]] || return 1
  curl -sf -m 12 -H "Authorization: Bearer $SECRET" "$url/health" 2>/dev/null \
    | grep -q 'arabic-buzz-mac-sync'
}

alert() {
  local msg="$1"
  echo "⚠️  $msg" | tee -a "$LOG_DIR/mac-tunnel-wake.log" >&2
  # Optional macOS notification when awake at desk
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$msg\" with title \"ArabicBuzz tunnel\"" 2>/dev/null || true
  fi
}

one_pass() {
  echo "── tunnel wake monitor $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
  local url
  url="$(resolve_mac_sync_url)"
  echo "MAC_SYNC_URL=${url:-unset}"

  if tunnel_ok "$url"; then
    echo "tunnel_health=ok"
    echo ok >"$STATE_DIR/tunnel_wake_last"
    return 0
  fi

  alert "MAC_SYNC tunnel dead or stale — healing via mac-hop-watchdog"
  set +e
  bash "$ROOT/scripts/mac-hop-watchdog.sh" --once-put 2>&1 | tee -a "$LOG_DIR/mac-tunnel-wake.log"
  set -e

  url="$(resolve_mac_sync_url)"
  if tunnel_ok "$url"; then
    echo "tunnel_health=recovered url=$url"
    echo recovered >"$STATE_DIR/tunnel_wake_last"
    return 0
  fi

  alert "MAC_SYNC still down after heal — check AC power / lid / OrbStack / npm run mac-hop:health"
  echo degraded >"$STATE_DIR/tunnel_wake_last"
  return 1
}

if [[ "$LOOP" -eq 1 ]]; then
  while true; do
    one_pass || true
    sleep "$INTERVAL"
  done
else
  one_pass
fi
