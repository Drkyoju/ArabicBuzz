#!/usr/bin/env bash
# Backup Hermes WhatsApp session + .env (+ config.yaml) to ~/Backups/hermes-wa/
# Never commits secrets. Excludes node_modules and large caches.
#
# Usage:
#   ./scripts/hermes-backup-wa-session.sh
#   ./scripts/hermes-backup-wa-session.sh --dir "$HOME/Backups/hermes-wa"
#   ./scripts/hermes-backup-wa-session.sh --keep 10

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DEST_ROOT="${HERMES_BACKUP_DIR:-$HOME/Backups/hermes-wa}"
KEEP=14

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DEST_ROOT="$2"; shift ;;
    --keep) KEEP="$2"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
  esac
  shift
done

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DEST_ROOT/$STAMP"
SESSION="$HERMES_HOME/platforms/whatsapp/session"
ARCHIVE="$DEST_ROOT/hermes-wa-${STAMP}.tgz"

mkdir -p "$DEST"
umask 077

if [[ ! -d "$SESSION" ]]; then
  echo "Missing session dir: $SESSION" >&2
  exit 1
fi

echo "Copying session…"
# Prefer ditto on macOS (faster); fall back to rsync/cp
if command -v ditto >/dev/null 2>&1; then
  ditto "$SESSION" "$DEST/session"
else
  mkdir -p "$DEST/session"
  rsync -a --exclude 'bridge.pid' --exclude '*.lock' "$SESSION/" "$DEST/session/"
fi
rm -f "$DEST/session/bridge.pid" 2>/dev/null || true

[[ -f "$HERMES_HOME/.env" ]] && cp -p "$HERMES_HOME/.env" "$DEST/env"
[[ -f "$HERMES_HOME/config.yaml" ]] && cp -p "$HERMES_HOME/config.yaml" "$DEST/config.yaml"
chmod -R go-rwx "$DEST" 2>/dev/null || true

echo "Archiving…"
tar -C "$DEST_ROOT" -czf "$ARCHIVE" "$STAMP"
chmod 600 "$ARCHIVE"
shasum -a 256 "$ARCHIVE" >"${ARCHIVE}.sha256"
chmod 600 "${ARCHIVE}.sha256"

# Drop unpacked tree after archive (saves disk); keep archive + checksum
rm -rf "$DEST"

# Prune old archives
ls -1t "$DEST_ROOT"/hermes-wa-*.tgz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "${old}.sha256"
done

echo "Backup OK: $ARCHIVE"
du -sh "$ARCHIVE"
cat "${ARCHIVE}.sha256"
