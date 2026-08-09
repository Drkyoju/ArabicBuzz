#!/usr/bin/env bash
# Install LaunchAgent that runs `caffeinate -dims` so the Mac stays awake while logged in.
# Templates: deploy/mac-hop/LaunchAgents/com.arabicbuzz.nosleep.plist
#
# Usage: ./scripts/install-mac-nosleep-launchd.sh
# Unload: ./scripts/install-mac-nosleep-launchd.sh --unload
# Optional AC pmset (needs sudo password): ./scripts/install-mac-nosleep-launchd.sh --pmset

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/mac-hop/LaunchAgents/com.arabicbuzz.nosleep.plist"
DEST="$HOME/Library/LaunchAgents"
LABEL="com.arabicbuzz.nosleep"
UNLOAD=0
DO_PMSET=0

for arg in "$@"; do
  case "$arg" in
    --unload) UNLOAD=1 ;;
    --pmset) DO_PMSET=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST" "$HOME/Library/Logs/ArabicBuzz"
plist="$DEST/${LABEL}.plist"

if [[ "$UNLOAD" -eq 1 ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "$plist" 2>/dev/null || true
  rm -f "$plist"
  echo "unloaded $LABEL"
  exit 0
fi

if [[ ! -f "$SRC" ]]; then
  echo "Missing template $SRC" >&2
  exit 1
fi

sed -e "s|__AB_HOME__|$HOME|g" "$SRC" >"$plist"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "$plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || launchctl load -w "$plist"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true
echo "loaded $LABEL → $plist"

if [[ "$DO_PMSET" -eq 1 ]]; then
  echo "Applying AC pmset (may prompt for password)…"
  # Prevent system sleep on adapter; leave display policy to caffeinate / user preference.
  sudo pmset -c sleep 0 disksleep 10 displaysleep 0 || true
  echo "Battery profile left alone (closing lid on battery will still sleep)."
fi

echo ""
echo "✅ nosleep LaunchAgent installed (caffeinate -dims while logged in)."
echo "⚠️  Lid closed + battery → Mac still sleeps. Prefer AC + lid open (or clamshell + external display)."
echo "   Check: pmset -g assertions | grep -i caffeinate"
echo "   Logs:  ~/Library/Logs/ArabicBuzz/nosleep.*.log"
