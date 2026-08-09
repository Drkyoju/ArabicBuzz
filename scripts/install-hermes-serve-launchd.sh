#!/usr/bin/env bash
# Install LaunchAgent for `hermes serve` ONLY when Desktop is not already
# owning the backend. Hermes.app typically starts serve on a dynamic port;
# this agent binds 127.0.0.1:9119 and refuses to fight an existing process.
#
# Usage:
#   ./scripts/install-hermes-serve-launchd.sh
#   ./scripts/install-hermes-serve-launchd.sh --unload

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.arabicbuzz.hermes-serve"
PLIST_SRC="$ROOT/deploy/hermes/LaunchAgents/${LABEL}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
WRAPPER="$HOME/Library/Application Support/ArabicBuzz/hermes-serve-wrapper.sh"
UID_NUM="$(id -u)"

UNLOAD=0
[[ "${1:-}" == "--unload" ]] && UNLOAD=1

mkdir -p "$HOME/Library/LaunchAgents" \
  "$HOME/Library/Logs/ArabicBuzz" \
  "$HOME/Library/Application Support/ArabicBuzz"

if [[ "$UNLOAD" -eq 1 ]]; then
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "Unloaded $LABEL"
  exit 0
fi

# Wrapper: skip if Desktop/serve already listening on 9119 or hermes serve running
cat >"$WRAPPER" <<'WRAP'
#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
LOG="$HOME/Library/Logs/ArabicBuzz/hermes-serve-wrapper.log"
mkdir -p "$(dirname "$LOG")"

# If Hermes Desktop already owns a serve process, stay idle (exit 0 so
# KeepAlive does not thrash — throttle via sleep loop).
if pgrep -f 'hermes_cli.main serve' >/dev/null 2>&1; then
  echo "[$(date)] hermes serve already running (Desktop or other) — idle wait" >>"$LOG"
  # KeepAlive expects a long-running process: sleep until that process dies
  while pgrep -f 'hermes_cli.main serve' >/dev/null 2>&1; do
    sleep 60
  done
  echo "[$(date)] previous serve exited — starting launchd-managed serve" >>"$LOG"
fi

if lsof -nP -iTCP:9119 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[$(date)] :9119 already in use — waiting" >>"$LOG"
  while lsof -nP -iTCP:9119 -sTCP:LISTEN >/dev/null 2>&1; do
    sleep 60
  done
fi

exec hermes serve --host 127.0.0.1 --port 9119 --skip-build
WRAP
chmod 755 "$WRAPPER"

sed -e "s|__AB_ROOT__|$ROOT|g" \
    -e "s|__AB_HOME__|$HOME|g" \
    -e "s|__AB_WRAPPER__|$WRAPPER|g" \
    "$PLIST_SRC" >"$PLIST_DST"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo "Installed $LABEL"
echo "Wrapper: $WRAPPER"
echo "If Hermes Desktop is open, wrapper idles until Desktop exits."
hermes serve --status 2>&1 | head -20 || true
