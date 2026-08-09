#!/usr/bin/env bash
# Watch Hermes WhatsApp bridge for new @g.us chats and auto-merge into allowlist.
#
# Intended as launchd (com.arabicbuzz.hermes-wa-watchdog) or cron every few minutes.
# Safe: only ADDS JIDs; never removes. Requires WHATSAPP_GROUP_POLICY=allowlist.
#
# Also restarts the gateway if /health is down or status != connected for too long,
# and optionally DMs Telegram owner via hermes send (if configured).
#
# Usage:
#   ./scripts/hermes-wa-watchdog.sh           # one pass
#   ./scripts/hermes-wa-watchdog.sh --loop    # every 120s
#   ./scripts/hermes-wa-watchdog.sh --scan    # also Baileys participating scan (stops bridge briefly)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
STATE_DIR="${AB_HERMES_WA_STATE:-$HOME/Library/Application Support/ArabicBuzz/hermes-wa}"
LOG_DIR="${AB_HERMES_WA_LOG:-$HOME/Library/Logs/ArabicBuzz}"
BRIDGE_PORT="${WHATSAPP_BRIDGE_PORT:-3000}"
LOOP=0
DO_SCAN=0
INTERVAL="${HERMES_WA_WATCH_INTERVAL:-120}"
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$STATE_DIR" "$LOG_DIR"

for arg in "$@"; do
  case "$arg" in
    --loop) LOOP=1 ;;
    --scan) DO_SCAN=1 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_DIR/hermes-wa-watchdog.log"; }

read_state() { [[ -f "$STATE_DIR/$1" ]] && cat "$STATE_DIR/$1" || echo ""; }
write_state() { echo "$2" >"$STATE_DIR/$1"; }

health_json() {
  curl -sf -m 5 "http://127.0.0.1:${BRIDGE_PORT}/health" 2>/dev/null || echo ""
}

ensure_bridge() {
  local h status fails
  h="$(health_json)"
  status="$(echo "$h" | python3 -c 'import sys,json
try:
  print(json.load(sys.stdin).get("status",""))
except Exception:
  print("")' 2>/dev/null || true)"

  if [[ "$status" == "connected" ]]; then
    write_state fail_count 0
    write_state last_ok "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    return 0
  fi

  fails="$(read_state fail_count)"
  fails="${fails:-0}"
  fails=$((fails + 1))
  write_state fail_count "$fails"
  log "WA bridge unhealthy status='${status:-none}' fails=$fails"

  if [[ "$fails" -ge 2 ]]; then
    log "Restarting hermes gateway (WA disconnect)"
    hermes gateway restart >>"$LOG_DIR/hermes-wa-watchdog.log" 2>&1 || true
    write_state fail_count 0
    write_state last_restart "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # Hermes is WhatsApp-only — no Telegram alerts
    log "Alert: WA bridge restarted (Hermes has no Telegram platform)"
  fi
}

scrape_new_jids() {
  local files=()
  [[ -f "$HERMES_HOME/platforms/whatsapp/bridge.log" ]] && files+=("$HERMES_HOME/platforms/whatsapp/bridge.log")
  [[ -f "$HERMES_HOME/logs/gateway.log" ]] && files+=("$HERMES_HOME/logs/gateway.log")
  [[ ${#files[@]} -eq 0 ]] && return 0
  rg -oN '[0-9]+@g\.us' "${files[@]}" 2>/dev/null | sort -u || true
}

current_allow() {
  local line
  line="$(grep -E '^WHATSAPP_GROUP_ALLOWED_USERS=' "$HERMES_HOME/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
  echo "$line" | tr ',' '\n' | sed '/^$/d' | sort -u
}

auto_allowlist() {
  local known scraped missing=()
  known="$(current_allow)"
  scraped="$(scrape_new_jids)"
  while IFS= read -r j; do
    [[ -z "$j" ]] && continue
    if ! echo "$known" | grep -qxF "$j"; then
      missing+=("$j")
    fi
  done <<<"$scraped"

  if [[ ${#missing[@]} -eq 0 ]]; then
    return 0
  fi

  log "New group JIDs detected: ${missing[*]}"
  local args=(--no-restart)
  local j
  for j in "${missing[@]}"; do
    args+=(--add "$j")
  done
  bash "$ROOT/scripts/hermes-wa-allowlist-sync.sh" "${args[@]}" >>"$LOG_DIR/hermes-wa-watchdog.log" 2>&1 || true
  hermes gateway restart >>"$LOG_DIR/hermes-wa-watchdog.log" 2>&1 || true
  log "Allowlist updated + gateway restarted (JIDs: ${missing[*]})"
}

one_pass() {
  log "── hermes-wa watchdog pass ──"
  ensure_bridge
  auto_allowlist
  if [[ "$DO_SCAN" -eq 1 ]]; then
    bash "$ROOT/scripts/hermes-wa-allowlist-sync.sh" --no-restart >>"$LOG_DIR/hermes-wa-watchdog.log" 2>&1 || true
    hermes gateway restart >>"$LOG_DIR/hermes-wa-watchdog.log" 2>&1 || true
  fi
}

if [[ "$LOOP" -eq 1 ]]; then
  while true; do
    one_pass || true
    sleep "$INTERVAL"
  done
else
  one_pass
fi
