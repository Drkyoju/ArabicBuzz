#!/usr/bin/env bash
# Keep Mac large-file hop alive while the laptop is awake:
#   - OrbStack pin (1.5.1)
#   - Local Bot API docker :8081
#   - storage:sync agent :7420
#   - cloudflared quick tunnels for 7420 + 8081
#   - PUT MAC_SYNC_URL + TELEGRAM_BOT_API_URL to CranL when URLs change
#
# NOT true 24/7 — Mac sleep still kills hops. For permanent path:
#   fly auth login && npm run telegram:bot-api:fly
#
# Usage:
#   ./scripts/mac-hop-watchdog.sh           # one pass
#   ./scripts/mac-hop-watchdog.sh --loop    # every 90s (launchd uses this)
#   ./scripts/mac-hop-watchdog.sh --once-put  # force CranL PUT even if URLs unchanged

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT_SYNC="${MAC_SYNC_PORT:-7420}"
PORT_BOTAPI="${TELEGRAM_BOT_API_PORT:-8081}"
STATE_DIR="${AB_HOP_STATE_DIR:-$HOME/Library/Application Support/ArabicBuzz/hop}"
LOG_DIR="${AB_HOP_LOG_DIR:-$HOME/Library/Logs/ArabicBuzz}"
LOOP=0
FORCE_PUT=0

for arg in "$@"; do
  case "$arg" in
    --loop) LOOP=1 ;;
    --once-put|--force-put) FORCE_PUT=1 ;;
  esac
done

mkdir -p "$STATE_DIR" "$HOME/bin" "$LOG_DIR"
# Keep /tmp aliases for older docs / greps
mkdir -p /tmp
ln -sfn "$LOG_DIR/ab-cloudflared-mac-sync.log" /tmp/ab-cloudflared-mac-sync.log 2>/dev/null || true
ln -sfn "$LOG_DIR/ab-cloudflared-botapi.log" /tmp/ab-cloudflared-botapi.log 2>/dev/null || true

load_dotenv_key() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//' || true
}

SECRET="${MAC_SYNC_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  SECRET="$(load_dotenv_key MAC_SYNC_SECRET .env.local)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(load_dotenv_key MAC_SYNC_SECRET .env.cranl.local)"
fi

CF_BIN="$("$ROOT/scripts/ensure-cloudflared.sh")"

pin_orbstack() {
  bash "$ROOT/scripts/pin-orbstack-1.5.1.sh" >/dev/null 2>&1 || true
}

ensure_botapi() {
  if curl -sS -m 2 "http://127.0.0.1:$PORT_BOTAPI/" >/dev/null 2>&1 \
    || curl -sS -m 2 "http://127.0.0.1:$PORT_BOTAPI/" 2>/dev/null | grep -q 'error_code\|Not Found\|ok'; then
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    bash "$ROOT/scripts/setup-always-on-bot-api.sh" >/tmp/ab-botapi-setup.log 2>&1 || true
  fi
}

ensure_mac_sync() {
  if [[ -z "$SECRET" ]]; then
    echo "MAC_SYNC_SECRET missing — skip agent" >&2
    return 1
  fi
  if curl -sf -m 2 -H "Authorization: Bearer $SECRET" "http://127.0.0.1:$PORT_SYNC/health" >/dev/null 2>&1; then
    return 0
  fi
  bash "$ROOT/scripts/restart-mac-sync.sh" >/tmp/ab-mac-sync-restart.log 2>&1 || true
  sleep 2
}

tunnel_url_ok() {
  local name="$1" url="$2"
  [[ -n "$url" && "$url" == https://* ]] || return 1
  if [[ "$name" == "mac-sync" ]]; then
    curl -sf -m 10 -H "Authorization: Bearer $SECRET" "$url/health" 2>/dev/null \
      | grep -q 'arabic-buzz-mac-sync'
    return $?
  fi
  # Bot API daemon: JSON 404 on / (not the mac-sync health payload)
  local body
  body=$(curl -sS -m 10 "$url/" 2>/dev/null || true)
  echo "$body" | grep -q '"error_code"' && ! echo "$body" | grep -q 'arabic-buzz-mac-sync'
}

start_tunnel() {
  local port="$1" name="$2"
  local log="$LOG_DIR/ab-cloudflared-${name}.log"
  local marker="cloudflared tunnel --url http://127.0.0.1:${port}"
  local alt_logs=("$log")
  if [[ "$name" == "mac-sync" ]]; then
    alt_logs+=("$LOG_DIR/ab-cloudflared-7420.log" "$LOG_DIR/ab-cloudflared-mac-sync.log")
  fi

  # Reuse last known good URL if still healthy
  local candidate=""
  if [[ "$name" == "mac-sync" ]]; then
    for candidate in \
      "$(read_state mac_sync_url)" \
      "$(load_dotenv_key MAC_SYNC_URL .env.local)" \
      "$(load_dotenv_key MAC_SYNC_URL .env.cranl.local)"; do
      if tunnel_url_ok mac-sync "$candidate"; then
        echo "$candidate"
        return 0
      fi
    done
  else
    for candidate in \
      "$(read_state botapi_url)" \
      "$(load_dotenv_key TELEGRAM_BOT_API_URL .env.local)" \
      "$(load_dotenv_key TELEGRAM_BOT_API_URL .env.cranl.local)"; do
      if tunnel_url_ok botapi "$candidate"; then
        echo "$candidate"
        return 0
      fi
    done
  fi

  # Already have a live tunnel process? Prefer its log URL.
  if ! pgrep -f "$marker" >/dev/null 2>&1; then
    : >"$log"
    nohup "$CF_BIN" tunnel --url "http://127.0.0.1:${port}" --no-autoupdate \
      >>"$log" 2>&1 &
    sleep 2
  fi

  local url=""
  for _ in $(seq 1 25); do
    for lf in "${alt_logs[@]}"; do
      url=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$lf" 2>/dev/null | tail -1 || true)
      if tunnel_url_ok "$name" "$url"; then
        echo "$url"
        return 0
      fi
    done
    sleep 1
  done

  # Stale process / dead quick tunnel — restart once
  pkill -f "$marker" 2>/dev/null || true
  sleep 1
  : >"$log"
  nohup "$CF_BIN" tunnel --url "http://127.0.0.1:${port}" --no-autoupdate \
    >>"$log" 2>&1 &
  for _ in $(seq 1 25); do
    url=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$log" 2>/dev/null | tail -1 || true)
    if tunnel_url_ok "$name" "$url"; then
      echo "$url"
      return 0
    fi
    sleep 1
  done
  echo ""
  return 1
}

read_state() {
  local f="$STATE_DIR/$1"
  [[ -f "$f" ]] && cat "$f" || echo ""
}

write_state() {
  echo "$2" >"$STATE_DIR/$1"
}

one_pass() {
  echo "── hop watchdog $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
  pin_orbstack
  ensure_botapi
  ensure_mac_sync || true

  local sync_url bot_url
  sync_url="$(start_tunnel "$PORT_SYNC" "mac-sync" || true)"
  bot_url="$(start_tunnel "$PORT_BOTAPI" "botapi" || true)"

  local prev_sync prev_bot
  prev_sync="$(read_state mac_sync_url)"
  prev_bot="$(read_state botapi_url)"

  local need_put=0
  local args=()

  if [[ -n "$sync_url" ]]; then
    echo "mac_sync_tunnel=$sync_url"
    write_state mac_sync_url "$sync_url"
    # Keep local .env.local in sync so restarts / other tools see the live URL
    if [[ -f "$ROOT/.env.local" ]] && [[ "$sync_url" != "$prev_sync" || "$FORCE_PUT" -eq 1 ]]; then
      if grep -qE '^MAC_SYNC_URL=' "$ROOT/.env.local"; then
        local tmp
        tmp="$(mktemp)"
        awk -v v="$sync_url" '
          BEGIN { done=0 }
          /^MAC_SYNC_URL=/ { print "MAC_SYNC_URL=" v; done=1; next }
          { print }
          END { if (!done) print "MAC_SYNC_URL=" v }
        ' "$ROOT/.env.local" >"$tmp"
        mv "$tmp" "$ROOT/.env.local"
      else
        printf '\nMAC_SYNC_URL=%s\n' "$sync_url" >>"$ROOT/.env.local"
      fi
      if grep -qE '^NEXT_PUBLIC_MAC_UPLOAD_URL=' "$ROOT/.env.local"; then
        local tmp2
        tmp2="$(mktemp)"
        awk -v v="$sync_url" '
          BEGIN { done=0 }
          /^NEXT_PUBLIC_MAC_UPLOAD_URL=/ { print "NEXT_PUBLIC_MAC_UPLOAD_URL=" v; done=1; next }
          { print }
          END { if (!done) print "NEXT_PUBLIC_MAC_UPLOAD_URL=" v }
        ' "$ROOT/.env.local" >"$tmp2"
        mv "$tmp2" "$ROOT/.env.local"
      fi
    fi
    if [[ "$FORCE_PUT" -eq 1 || "$sync_url" != "$prev_sync" ]]; then
      need_put=1
      args+=("MAC_SYNC_URL=$sync_url" "NEXT_PUBLIC_MAC_UPLOAD_URL=$sync_url")
    fi
  else
    echo "⚠️  mac-sync tunnel URL not ready" >&2
  fi

  if [[ -n "$bot_url" ]]; then
    echo "botapi_tunnel=$bot_url"
    write_state botapi_url "$bot_url"
    if [[ "$FORCE_PUT" -eq 1 || "$bot_url" != "$prev_bot" ]]; then
      need_put=1
      args+=("TELEGRAM_BOT_API_URL=$bot_url")
    fi
  else
    echo "⚠️  botapi tunnel URL not ready" >&2
  fi

  if [[ "$need_put" -eq 1 && ${#args[@]} -gt 0 ]]; then
    echo "Updating CranL env (tunnel URL changed or --force-put)…"
    # Restart only when a URL actually changed (or --force-put), not on every loop
    local restart_flag=()
    if [[ "$FORCE_PUT" -eq 1 ]]; then
      restart_flag=(--restart)
    elif [[ -n "$bot_url" && "$bot_url" != "$prev_bot" ]]; then
      restart_flag=(--restart)
    elif [[ -n "$sync_url" && "$sync_url" != "$prev_sync" ]]; then
      restart_flag=(--restart)
    fi
    # Cooldown file — never stop/start CranL more than once per 10 minutes
    local cool="$STATE_DIR/last_cranl_restart"
    if [[ ${#restart_flag[@]} -gt 0 && -f "$cool" ]]; then
      local age=$(( $(date +%s) - $(cat "$cool" 2>/dev/null || echo 0) ))
      if [[ "$age" -lt 600 && "$FORCE_PUT" -eq 0 ]]; then
        echo "skip_restart cooldown=${age}s"
        restart_flag=()
      fi
    fi
    bash "$ROOT/scripts/cranl-put-env-keys.sh" "${restart_flag[@]}" "${args[@]}" || true
    if [[ ${#restart_flag[@]} -gt 0 ]]; then
      date +%s >"$cool"
    fi
  else
    echo "CranL URLs unchanged — no PUT"
  fi
}

if [[ "$LOOP" -eq 1 ]]; then
  while true; do
    one_pass || true
    FORCE_PUT=0
    sleep 90
  done
else
  one_pass
fi
