#!/usr/bin/env bash
# Install launchd agents so Mac hop auto-restarts while logged in / awake.
# Templates live in deploy/mac-hop/LaunchAgents/ — copied to ~/Library/LaunchAgents.
#
# Usage: ./scripts/install-mac-hop-launchd.sh
# Unload: ./scripts/install-mac-hop-launchd.sh --unload

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/mac-hop/LaunchAgents"
DEST="$HOME/Library/LaunchAgents"
UNLOAD=0
[[ "${1:-}" == "--unload" ]] && UNLOAD=1

mkdir -p "$DEST" "$HOME/bin" "$HOME/Library/Logs/ArabicBuzz"
"$ROOT/scripts/ensure-cloudflared.sh" >/dev/null

LABELS=(
  com.arabicbuzz.hop-watchdog
)
# Note: storage:sync is managed by the watchdog (ensure_mac_sync) to avoid
# EADDRINUSE fights with an already-running agent. Optional separate agent:
#   deploy/mac-hop/LaunchAgents/com.arabicbuzz.mac-sync.plist


for label in "${LABELS[@]}"; do
  plist="$DEST/${label}.plist"
  if [[ "$UNLOAD" -eq 1 ]]; then
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || launchctl unload "$plist" 2>/dev/null || true
    rm -f "$plist"
    echo "unloaded $label"
    continue
  fi

  template="$SRC/${label}.plist"
  if [[ ! -f "$template" ]]; then
    echo "Missing template $template" >&2
    exit 1
  fi

  # Substitute repo path + home
  sed -e "s|__AB_ROOT__|$ROOT|g" -e "s|__AB_HOME__|$HOME|g" "$template" >"$plist"
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || launchctl unload "$plist" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || launchctl load -w "$plist"
  launchctl enable "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null || true
  echo "loaded $label → $plist"
done

if [[ "$UNLOAD" -eq 0 ]]; then
  bash "$ROOT/scripts/pin-orbstack-1.5.1.sh" || true
  echo ""
  echo "✅ Mac hop launchd installed (runs while you are logged in / Mac awake)."
  echo "   Watchdog refreshes trycloudflare URLs → CranL every ~90s."
  echo "   True 24/7 still needs VPS: npm run telegram:bot-api:fly (after fly auth login)"
fi
