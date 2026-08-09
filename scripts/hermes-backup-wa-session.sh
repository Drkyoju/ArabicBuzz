#!/usr/bin/env bash
# Backup / verify / restore Hermes WhatsApp session (local only — never git).
#
# Usage:
#   ./scripts/hermes-backup-wa-session.sh                 # backup
#   ./scripts/hermes-backup-wa-session.sh --verify FILE   # checksum + list
#   ./scripts/hermes-backup-wa-session.sh --restore FILE  # stop gateway → restore → restart
#   ./scripts/hermes-backup-wa-session.sh --list
#   ./scripts/hermes-backup-wa-session.sh --keep 10

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DEST_ROOT="${HERMES_BACKUP_DIR:-$HOME/Backups/hermes-wa}"
KEEP=14
MODE=backup
RESTORE_FILE=""
VERIFY_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DEST_ROOT="$2"; shift ;;
    --keep) KEEP="$2"; shift ;;
    --list) MODE=list ;;
    --verify) MODE=verify; VERIFY_FILE="$2"; shift ;;
    --restore) MODE=restore; RESTORE_FILE="$2"; shift ;;
    -h|--help)
      cat <<'EOF'
Backup Hermes WhatsApp session + .env + config.yaml → ~/Backups/hermes-wa/

  (default)              create hermes-wa-YYYYMMDD-HHMMSS.tgz + .sha256
  --list                 show archives (newest first)
  --verify FILE.tgz      check sha256 + list archive top entries
  --restore FILE.tgz     stop gateway, restore session, restart gateway
  --dir DIR              backup root (default ~/Backups/hermes-wa)
  --keep N               keep newest N archives (default 14)

Never commit backups. Prefer encrypted offsite copy of the .tgz.
EOF
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
  shift
done

SESSION="$HERMES_HOME/platforms/whatsapp/session"
mkdir -p "$DEST_ROOT"
umask 077

list_archives() {
  ls -1t "$DEST_ROOT"/hermes-wa-*.tgz 2>/dev/null || true
}

if [[ "$MODE" == "list" ]]; then
  echo "Archives in $DEST_ROOT:"
  local_count=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local_count=$((local_count + 1))
    sz=$(du -sh "$f" 2>/dev/null | awk '{print $1}')
    echo "  $sz  $f"
    [[ -f "${f}.sha256" ]] && echo "         checksum: ${f}.sha256"
  done < <(list_archives)
  if [[ "$local_count" -eq 0 ]]; then
    echo "  (none yet — run without args to create one)"
  fi
  exit 0
fi

if [[ "$MODE" == "verify" ]]; then
  [[ -n "$VERIFY_FILE" && -f "$VERIFY_FILE" ]] || {
    echo "Missing archive: $VERIFY_FILE" >&2
    exit 1
  }
  echo "Verifying $VERIFY_FILE …"
  if [[ -f "${VERIFY_FILE}.sha256" ]]; then
    if command -v shasum >/dev/null 2>&1; then
      (cd "$(dirname "$VERIFY_FILE")" && shasum -a 256 -c "$(basename "$VERIFY_FILE").sha256")
    else
      echo "shasum missing — skipped checksum" >&2
    fi
  else
    echo "⚠️  no .sha256 beside archive" >&2
  fi
  echo "Contents (top):"
  tar -tzf "$VERIFY_FILE" | head -40
  echo "…"
  # Never print .env contents
  if tar -tzf "$VERIFY_FILE" | grep -q '/env$'; then
    echo "✅ includes env file (secrets — do not open in chat logs)"
  fi
  if tar -tzf "$VERIFY_FILE" | grep -q '/session/'; then
    echo "✅ includes session tree"
  else
    echo "❌ session tree missing" >&2
    exit 1
  fi
  echo "Verify OK"
  exit 0
fi

if [[ "$MODE" == "restore" ]]; then
  [[ -n "$RESTORE_FILE" && -f "$RESTORE_FILE" ]] || {
    echo "Missing archive: $RESTORE_FILE" >&2
    exit 1
  }
  echo "════════════════════════════════════════"
  echo " Hermes WA · restore session"
  echo "════════════════════════════════════════"
  echo "From: $RESTORE_FILE"
  echo "To:   $SESSION"
  echo ""
  if [[ -f "${RESTORE_FILE}.sha256" ]]; then
    (cd "$(dirname "$RESTORE_FILE")" && shasum -a 256 -c "$(basename "$RESTORE_FILE").sha256") || {
      echo "Checksum failed — aborting restore" >&2
      exit 1
    }
  fi

  export PATH="$HOME/.local/bin:$PATH"
  if command -v hermes >/dev/null 2>&1; then
    echo "Stopping gateway…"
    hermes gateway stop 2>/dev/null || true
    sleep 1
  fi

  STAMP="$(date +%Y%m%d-%H%M%S)"
  if [[ -d "$SESSION" ]]; then
    BAK="$HERMES_HOME/platforms/whatsapp/session.bak-$STAMP"
    echo "Moving current session → $BAK"
    mv "$SESSION" "$BAK"
  fi

  TMP="$(mktemp -d)"
  tar -xzf "$RESTORE_FILE" -C "$TMP"
  # Archive layout: DEST_ROOT/STAMP/{session,env,config.yaml}
  INNER="$(find "$TMP" -maxdepth 2 -type d -name session | head -1)"
  if [[ -z "$INNER" ]]; then
    echo "No session/ inside archive" >&2
    rm -rf "$TMP"
    exit 1
  fi
  mkdir -p "$(dirname "$SESSION")"
  mv "$INNER" "$SESSION"
  PARENT="$(dirname "$INNER")"
  [[ -f "$PARENT/env" ]] && cp -p "$PARENT/env" "$HERMES_HOME/.env.restored-$STAMP"
  [[ -f "$PARENT/config.yaml" ]] && cp -p "$PARENT/config.yaml" "$HERMES_HOME/config.yaml.restored-$STAMP"
  chmod -R go-rwx "$SESSION" 2>/dev/null || true
  rm -rf "$TMP"

  echo "Restored session. Optional: compare .env.restored-* then merge manually."
  if command -v hermes >/dev/null 2>&1; then
    echo "Starting gateway…"
    hermes gateway restart 2>/dev/null || hermes gateway start 2>/dev/null || true
    sleep 2
    hermes gateway status 2>/dev/null || true
  fi
  echo "Restore OK. If WA asks for QR again, re-pair: hermes whatsapp"
  echo "════════════════════════════════════════"
  exit 0
fi

# ── backup (default) ──────────────────────────────────────────────
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DEST_ROOT/$STAMP"
ARCHIVE="$DEST_ROOT/hermes-wa-${STAMP}.tgz"

if [[ ! -d "$SESSION" ]]; then
  echo "Missing session dir: $SESSION" >&2
  exit 1
fi

mkdir -p "$DEST"
echo "Copying session…"
if command -v ditto >/dev/null 2>&1; then
  ditto "$SESSION" "$DEST/session"
else
  mkdir -p "$DEST/session"
  rsync -a --exclude 'bridge.pid' --exclude '*.lock' "$SESSION/" "$DEST/session/" 2>/dev/null \
    || cp -a "$SESSION/." "$DEST/session/"
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
rm -rf "$DEST"

ls -1t "$DEST_ROOT"/hermes-wa-*.tgz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "${old}.sha256"
done

echo "════════════════════════════════════════"
echo " Hermes WA · backup OK"
echo "════════════════════════════════════════"
echo "Archive:  $ARCHIVE"
du -sh "$ARCHIVE"
cat "${ARCHIVE}.sha256"
echo ""
echo "Verify:  ./scripts/hermes-backup-wa-session.sh --verify \"$ARCHIVE\""
echo "Restore: ./scripts/hermes-backup-wa-session.sh --restore \"$ARCHIVE\""
echo "List:    ./scripts/hermes-backup-wa-session.sh --list"
echo "Never git / never share the .tgz (contains session + .env)."
echo "════════════════════════════════════════"
