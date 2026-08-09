#!/usr/bin/env bash
# Hermes WhatsApp → Google Drive archive (allowlisted groups, anti-ban delays).
# Secrets stay in ~/.hermes/ — never printed.
# For voice/audio: optionally transcribe (local STT ar) and upload a .txt sidecar
# so Drive fullText search can find the content.
#
# Usage:
#   ./scripts/hermes-wa-drive-archive.sh --archive /path/to/file [--name NAME] [--with-transcript|--no-transcript]
#   ./scripts/hermes-wa-drive-archive.sh --status [--max N]
#   ./scripts/hermes-wa-drive-archive.sh --search 'كلمة' [--max N]
#   ./scripts/hermes-wa-drive-archive.sh --help
#
# Env:
#   HERMES_DRIVE_FOLDER_ID   default: الوقف folder
#   HERMES_ARCHIVE_DELAY_SEC delay before upload (default 8, anti-ban)
#   HERMES_HOME              default: ~/.hermes
#   HERMES_ARCHIVE_TRANSCRIPT  default: auto (on for audio/voice extensions)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
FOLDER_ID="${HERMES_DRIVE_FOLDER_ID:-1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw}"
FOLDER_URL="https://drive.google.com/drive/folders/${FOLDER_ID}"
GAPI="${HERMES_GAPI:-$HERMES_HOME/bin/hermes-gapi}"
FILE_READ="${HERMES_FILE_READ:-$HERMES_HOME/bin/hermes-file-read}"
DELAY_SEC="${HERMES_ARCHIVE_DELAY_SEC:-8}"
export PATH="$HERMES_HOME/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
# Cap delay so a mis-set env cannot freeze the agent for minutes.
if [[ "$DELAY_SEC" =~ ^[0-9]+$ ]] && (( DELAY_SEC > 45 )); then
  DELAY_SEC=45
fi

MODE=""
FILE=""
NAME=""
MAX=15
QUERY=""
# auto | 1 | 0
WITH_TRANSCRIPT="${HERMES_ARCHIVE_TRANSCRIPT:-auto}"

usage() {
  sed -n '2,18p' "$0"
}

is_audio_file() {
  local base ext
  base="$(basename "$1")"
  ext="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    *.ogg|*.opus|*.oga|*.mp3|*.m4a|*.wav|*.aac|*.flac|*.webm) return 0 ;;
    *) return 1 ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive|-a) MODE=archive; FILE="${2:-}"; shift 2 || true ;;
    --name) NAME="${2:-}"; shift 2 || true ;;
    --status|-s) MODE=status; shift ;;
    --search) MODE=search; QUERY="${2:-}"; shift 2 || true ;;
    --max) MAX="${2:-15}"; shift 2 ;;
    --with-transcript) WITH_TRANSCRIPT=1; shift ;;
    --no-transcript) WITH_TRANSCRIPT=0; shift ;;
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

  want_tx=0
  if [[ "$WITH_TRANSCRIPT" == "1" ]]; then
    want_tx=1
  elif [[ "$WITH_TRANSCRIPT" == "auto" ]] && is_audio_file "$FILE"; then
    want_tx=1
  fi

  TX_TMP=""
  TX_NAME=""
  if (( want_tx == 1 )); then
    if [[ -x "$FILE_READ" || -x "$ROOT/scripts/hermes-file-read.sh" ]]; then
      READ_BIN="$FILE_READ"
      [[ -x "$READ_BIN" ]] || READ_BIN="$ROOT/scripts/hermes-file-read.sh"
      echo "تفريغ صوتي محلي (عربي) قبل الأرشفة…" >&2
      tx_json="$("$READ_BIN" "$FILE" --max-chars 20000 2>/dev/null || true)"
      tx_text="$(
        HERMES_TX_JSON="$tx_json" python3 - <<'PY'
import json, os
raw = os.environ.get("HERMES_TX_JSON") or ""
try:
    d = json.loads(raw)
except Exception:
    print("")
    raise SystemExit
if d.get("ok") and (d.get("text") or "").strip():
    print(d["text"].strip())
PY
      )"
      if [[ -n "$tx_text" ]]; then
        TX_TMP="$(mktemp -t hermes-wa-tx.XXXXXX).txt"
        # Write UTF-8 transcript with small Arabic header for searchability
        {
          printf 'تفريغ صوتي (هيرميس / أرشفة واتساب)\n'
          printf 'المصدر: %s\n' "$base"
          printf '---\n'
          printf '%s\n' "$tx_text"
        } > "$TX_TMP"
        # Sidecar name mirrors archive name
        if [[ "$NAME" == *.* ]]; then
          TX_NAME="${NAME%.*}.txt"
        else
          TX_NAME="${NAME}.txt"
        fi
        echo "تفريغ جاهز → سيُرفع بجانب الملف (${#tx_text} حرف)." >&2
      else
        echo "⚠️ تعذّر التفريغ الصوتي — ستُرفع الوسائط فقط." >&2
      fi
    else
      echo "⚠️ hermes-file-read غير متاح — أرشفة الوسائط بدون تفريغ." >&2
    fi
  fi

  echo "أرشفة إلى الوقف بعد ${DELAY_SEC}ث (anti-ban)…"
  sleep "$DELAY_SEC"
  # Prefer upload-waqf wrapper (forces parent folder).
  out="$("$GAPI" drive upload-waqf "$FILE" --name "$NAME" 2>&1)" || {
    echo "$out" >&2
    [[ -n "$TX_TMP" ]] && rm -f "$TX_TMP"
    echo "⚠️ الرفع فشل — إن كان الخطأ صلاحيات، أعد ربط Google في ArabicBuzz ثم:" >&2
    echo "   $ROOT/scripts/hermes-drive-setup.sh --from-arabicbuzz" >&2
    exit 1
  }
  echo "$out"

  if [[ -n "$TX_TMP" && -f "$TX_TMP" && -n "$TX_NAME" ]]; then
    tx_out="$("$GAPI" drive upload-waqf "$TX_TMP" --name "$TX_NAME" 2>&1)" || {
      echo "⚠️ رفع التفريغ فشل (الملف الصوتي رُفع): $tx_out" >&2
      rm -f "$TX_TMP"
      exit 0
    }
    echo "$tx_out"
    echo "أُرشِف التفريغ أيضاً: $TX_NAME (قابل للبحث fullText)."
    rm -f "$TX_TMP"
  fi
  exit 0
fi

echo "Unknown mode" >&2
exit 1
