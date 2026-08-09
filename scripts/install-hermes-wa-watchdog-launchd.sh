#!/usr/bin/env bash
# Install launchd: Hermes WhatsApp allowlist + disconnect watchdog.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.arabicbuzz.hermes-wa-watchdog"
PLIST_SRC="$ROOT/deploy/hermes/LaunchAgents/${LABEL}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

UNLOAD=0
[[ "${1:-}" == "--unload" ]] && UNLOAD=1

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/ArabicBuzz"

if [[ "$UNLOAD" -eq 1 ]]; then
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "Unloaded $LABEL"
  exit 0
fi

sed -e "s|__AB_ROOT__|$ROOT|g" -e "s|__AB_HOME__|$HOME|g" "$PLIST_SRC" >"$PLIST_DST"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
echo "Installed $LABEL → $PLIST_DST"
echo "Logs: ~/Library/Logs/ArabicBuzz/hermes-wa-watchdog.log"
