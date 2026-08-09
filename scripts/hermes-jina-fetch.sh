#!/usr/bin/env bash
# Free URL → markdown via Jina Reader (no API key). Anti-ban: used only on demand.
# Usage: ./scripts/hermes-jina-fetch.sh 'https://example.com/page' [--max-chars N]

set -euo pipefail

URL=""
MAX_CHARS=12000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-chars) MAX_CHARS="${2:-12000}"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 URL [--max-chars N]"
      exit 0
      ;;
    *)
      URL="$1"
      shift
      ;;
  esac
done

[[ -n "$URL" ]] || { echo "Missing URL" >&2; exit 1; }
case "$URL" in
  http://*|https://*) ;;
  *) echo "URL must start with http(s)://" >&2; exit 1 ;;
esac

# Jina Reader: https://r.jina.ai/<url>
ENCODED="$URL"
BODY="$(curl -fsSL --max-time 45 -H 'Accept: text/plain' "https://r.jina.ai/${ENCODED}" 2>&1)" || {
  echo "❌ Jina fetch failed for URL" >&2
  echo "$BODY" >&2
  exit 1
}

if (( ${#BODY} > MAX_CHARS )); then
  BODY="${BODY:0:MAX_CHARS}"
  echo "[truncated to ${MAX_CHARS} chars]"
fi
printf '%s\n' "$BODY"
