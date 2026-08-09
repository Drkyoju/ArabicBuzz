#!/usr/bin/env bash
# Hermes WA storage mesh (parallel to ArabicBuzz find_storage_mesh — NOT linked).
# Order: Drive مجلد الوقف → local Hermes caches → Desktop (optional).
# Never calls ArabicBuzz HTTP / Telegram webhook.
#
# Usage:
#   ./scripts/hermes-storage-mesh.sh --search 'كلمة' [--max N] [--no-local]
#   ./scripts/hermes-storage-mesh.sh --help
#
# Env:
#   HERMES_DRIVE_FOLDER_ID  default: الوقف
#   HERMES_HOME             default: ~/.hermes
#   HERMES_MESH_LOCAL_ROOTS extra dirs (colon-separated)

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
FOLDER_ID="${HERMES_DRIVE_FOLDER_ID:-1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw}"
GAPI="${HERMES_GAPI:-$HERMES_HOME/bin/hermes-gapi}"
export PATH="$HERMES_HOME/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

MODE=""
QUERY=""
MAX=10
NO_LOCAL=0

usage() {
  sed -n '2,16p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --search|-s) MODE=search; QUERY="${2:-}"; shift 2 || true ;;
    --max) MAX="${2:-10}"; shift 2 ;;
    --no-local) NO_LOCAL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$MODE" ]]; then
        MODE=search
        QUERY="$1"
        shift
      else
        echo "Unknown arg: $1 (try --help)" >&2
        exit 1
      fi
      ;;
  esac
done

MODE="${MODE:-search}"
[[ "$MODE" == "search" ]] || { echo "Only --search is supported" >&2; exit 1; }
[[ -n "$QUERY" ]] || { echo "Missing --search QUERY" >&2; exit 1; }

escape_drive_q() {
  printf '%s' "$1" | sed "s/'/\\\\'/g"
}

echo "=== شبكة التخزين (هيرميس) — Drive الوقف أولاً ثم محلي ==="
echo "الاستعلام: $QUERY"
echo "مجلد الوقف: $FOLDER_ID"
echo

# 1) Drive
if [[ -x "$GAPI" ]]; then
  SAFE="$(escape_drive_q "$QUERY")"
  echo "-- Drive (الوقف) --"
  # Prefer name contains; also try fullText (may return more noise)
  set +e
  "$GAPI" drive search \
    "('${FOLDER_ID}' in parents) and trashed=false and name contains '${SAFE}'" \
    --raw-query --max "$MAX" 2>/dev/null
  name_rc=$?
  "$GAPI" drive search \
    "('${FOLDER_ID}' in parents) and trashed=false and fullText contains '${SAFE}'" \
    --raw-query --max "$MAX" 2>/dev/null
  text_rc=$?
  set -e
  if [[ $name_rc -ne 0 && $text_rc -ne 0 ]]; then
    echo "(لا نتائج Drive أو فشل hermes-gapi — راجع hermes-drive-setup.sh --probe)"
  fi
else
  echo "-- Drive --"
  echo "❌ missing hermes-gapi at $GAPI"
fi

echo

# 2) Local caches
if [[ "$NO_LOCAL" -eq 1 ]]; then
  exit 0
fi

echo "-- محلي (كاش هيرميس / سطح المكتب) --"
ROOTS=(
  "$HERMES_HOME/document_cache"
  "$HERMES_HOME/image_cache"
  "$HERMES_HOME/audio_cache"
  "$HOME/Desktop"
)
if [[ -n "${HERMES_MESH_LOCAL_ROOTS:-}" ]]; then
  IFS=':' read -r -a EXTRA <<< "$HERMES_MESH_LOCAL_ROOTS"
  ROOTS+=("${EXTRA[@]}")
fi

# Case-insensitive substring on basename; cap results
found=0
for root in "${ROOTS[@]}"; do
  [[ -d "$root" ]] || continue
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    # skip secrets / noise
    case "$base" in
      .env|*.pem|*.key|google_token.json|creds.json|auth.json) continue ;;
    esac
    printf 'local\t%s\t%s\n' "$root" "$f"
    found=$((found + 1))
    if (( found >= MAX )); then
      echo "(حد أقصى $MAX محلياً)"
      exit 0
    fi
  done < <(find "$root" -type f -iname "*${QUERY}*" -print0 2>/dev/null | head -z -n "$MAX")
done

if (( found == 0 )); then
  echo "(لا ملفات محلية تطابق الاسم)"
fi
