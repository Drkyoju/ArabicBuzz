#!/usr/bin/env bash
# Hermes WhatsApp → Google Drive archive (allowlisted groups, anti-ban delays).
# Secrets stay in ~/.hermes/ — never printed.
#
# Usage:
#   ./scripts/hermes-wa-drive-archive.sh --archive /path/to/file [--name NAME]
#   ./scripts/hermes-wa-drive-archive.sh --status [--max N]
#   ./scripts/hermes-wa-drive-archive.sh --search 'كلمة' [--max N]
#   ./scripts/hermes-wa-drive-archive.sh --help
#
# Env:
#   HERMES_DRIVE_FOLDER_ID   default: الوقف folder
#   HERMES_ARCHIVE_DELAY_SEC delay before upload (default 8, anti-ban)
#   HERMES_HOME              default: ~/.hermes

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
FOLDER_ID="${HERMES_DRIVE_FOLDER_ID:-1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw}"
FOLDER_URL="https://drive.google.com/drive/folders/${FOLDER_ID}"
GAPI="${HERMES_GAPI:-$HERMES_HOME/bin/hermes-gapi}"
DELAY_SEC="${HERMES_ARCHIVE_DELAY_SEC:-8}"
# Cap delay so a mis-set env cannot freeze the agent for minutes.
if [[ "$DELAY_SEC" =~ ^[0-9]+$ ]] && (( DELAY_SEC > 45 )); then
  DELAY_SEC=45
fi

MODE=""
FILE=""
NAME=""
MAX=15
QUERY=""

usage() {
  sed -n '2,16p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive|-a) MODE=archive; FILE="${2:-}"; shift 2 || true ;;
    --name) NAME="${2:-}"; shift 2 || true ;;
    --status|-s) MODE=status; shift ;;
    --search) MODE=search; QUERY="${2:-}"; shift 2 || true ;;
    --max) MAX="${2:-15}"; shift 2 || true ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$MODE" && -f "$1" ]]; then
        MODE=archive
        FILE="$1"
        shift
      else
        echo "Unknown arg: $1 (try --help)" >&2
        exit 1
      fi
      ;;
  esac
done

MODE="${MODE:-status}"

if [[ ! -x "$GAPI" ]]; then
  echo "❌ missing hermes-gapi at $GAPI — run Drive setup first" >&2
  exit 1
fi

escape_drive_q() {
  # Drive fullText strings use single quotes; escape embedded ones.
  printf '%s' "$1" | sed "s/'/\\\\'/g"
}

if [[ "$MODE" == "status" ]]; then
  echo "مجلد الأرشيف: $FOLDER_ID"
  echo "الرابط: $FOLDER_URL"
  echo "أحدث الملفات (حد أقصى $MAX):"
  "$GAPI" drive list-waqf "$MAX" || true
  exit 0
fi

if [[ "$MODE" == "search" ]]; then
  [[ -n "$QUERY" ]] || { echo "Missing --search QUERY" >&2; exit 1; }
  SAFE="$(escape_drive_q "$QUERY")"
  "$GAPI" drive search \
    "('${FOLDER_ID}' in parents) and trashed=false and fullText contains '${SAFE}'" \
    --raw-query --max "$MAX"
  exit 0
fi

if [[ "$MODE" == "archive" ]]; then
  [[ -n "$FILE" && -f "$FILE" ]] || { echo "Missing readable file for --archive" >&2; exit 1; }
  # Refuse paths that look like secrets dumps
  base="$(basename "$FILE")"
  case "$base" in
    .env|*.pem|*.key|google_token.json|google_client_secret.json|auth.json)
      echo "❌ refusing to archive secret-looking file: $base" >&2
      exit 1
      ;;
  esac

  if [[ -z "$NAME" ]]; then
    stamp="$(date -u +%Y%m%d-%H%M%S)"
    NAME="wa-${stamp}-${base}"
  fi

  echo "أرشفة إلى الوقف بعد ${DELAY_SEC}ث (anti-ban)…"
  sleep "$DELAY_SEC"
  # Prefer upload-waqf wrapper (forces parent folder).
  out="$("$GAPI" drive upload-waqf "$FILE" --name "$NAME" 2>&1)" || {
    echo "$out" >&2
    echo "⚠️ الرفع فشل — إن كان الخطأ صلاحيات، أعد ربط Google في ArabicBuzz ثم:" >&2
    echo "   $ROOT/scripts/hermes-drive-setup.sh --from-arabicbuzz" >&2
    exit 1
  }
  echo "$out"
  exit 0
fi

echo "Unknown mode" >&2
exit 1
