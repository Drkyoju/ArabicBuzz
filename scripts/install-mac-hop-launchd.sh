#!/usr/bin/env bash
# Install launchd agents so Mac hop auto-restarts while logged in / awake.
# Templates live in deploy/mac-hop/LaunchAgents/ — copied to ~/Library/LaunchAgents.
#
# Also installs nosleep (caffeinate) by default so idle sleep is less likely.
# Skip with: ./scripts/install-mac-hop-launchd.sh --no-nosleep
#
# Usage: ./scripts/install-mac-hop-launchd.sh
# Unload: ./scripts/install-mac-hop-launchd.sh --unload

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/mac-hop/LaunchAgents"
DEST="$HOME/Library/LaunchAgents"
UNLOAD=0
WITH_NOSLEEP=1
for arg in "$@"; do
  case "$arg" in
    --unload) UNLOAD=1 ;;
    --no-nosleep) WITH_NOSLEEP=0 ;;
  esac
done

mkdir -p "$DEST" "$HOME/bin" "$HOME/Library/Logs/ArabicBuzz"
"$ROOT/scripts/ensure-cloudflared.sh" >/dev/null

LABELS=(
  com.arabicbuzz.hop-watchdog
  com.arabicbuzz.tunnel-wake
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

if [[ "$UNLOAD" -eq 1 ]]; then
  if [[ "$WITH_NOSLEEP" -eq 1 ]]; then
    bash "$ROOT/scripts/install-mac-nosleep-launchd.sh" --unload || true
  fi
  exit 0
fi

bash "$ROOT/scripts/pin-orbstack-1.5.1.sh" || true

if [[ "$WITH_NOSLEEP" -eq 1 ]]; then
  bash "$ROOT/scripts/install-mac-nosleep-launchd.sh" || true
fi

echo ""
echo "✅ Mac hop launchd installed (runs while you are logged in / Mac awake)."
echo "   Watchdog refreshes trycloudflare URLs → CranL (~90s healthy / ~25s after wake fail)."
echo "   OrbStack stays pinned to 1.5.1 — never upgrade from the OrbStack UI."
echo ""
echo "Verifying hop_health (one pass)…"
if bash "$ROOT/scripts/mac-hop-health.sh"; then
  echo "✅ hop_health=ok — ready while Mac is awake."
else
  echo "⚠️ hop_health=degraded — check OrbStack 1.5.1, Docker, network; retry: npm run mac-hop:health"
fi
echo ""
echo "Sleep limits (hop is NOT 24/7):"
echo "  • Plug in the power adapter (AC)."
echo "  • Keep lid open, or clamshell + AC + external display."
echo "  • Battery → Options → Prevent automatic sleeping when display is off (on adapter)."
echo "  • Stay logged in — logout stops user LaunchAgents."
echo "  • Later 24/7 Bot API (paid Fly): read docs/fly-bot-api-prepare.md then npm run telegram:bot-api:fly"
echo ""
echo "One-command install was: npm run mac-hop:install"
echo "Re-check anytime:        npm run mac-hop:health"
