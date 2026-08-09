#!/usr/bin/env bash
# Hermes WhatsApp ↔ Google Drive working folder helper (no secrets printed).
# Usage:
#   ./scripts/hermes-drive-setup.sh --status
#   ./scripts/hermes-drive-setup.sh --auth-url
#   ./scripts/hermes-drive-setup.sh --auth-code 'URL_OR_CODE'
#   ./scripts/hermes-drive-setup.sh --probe

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
FOLDER_ID="${HERMES_DRIVE_FOLDER_ID:-1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw}"
FOLDER_URL="https://drive.google.com/drive/folders/${FOLDER_ID}"
ACCOUNT_HINT="${HERMES_GOOGLE_ACCOUNT_HINT:-ryodan71@gmail.com}"
PY="${HERMES_GOOGLE_PYTHON:-$HERMES_HOME/google-venv/bin/python}"
GSETUP="$HERMES_HOME/skills/productivity/google-workspace/scripts/setup.py"
GAPI_WRAP="$HERMES_HOME/bin/hermes-gapi"

MODE="${1:---status}"
case "$MODE" in
  --status|-s) MODE=status ;;
  --auth-url) MODE=auth-url ;;
  --auth-code) MODE=auth-code; CODE="${2:-}" ;;
  --probe) MODE=probe ;;
  -h|--help)
    sed -n '2,12p' "$0"
    exit 0
    ;;
  *)
    echo "Unknown: $1 (try --status | --auth-url | --auth-code CODE | --probe)" >&2
    exit 1
    ;;
esac

echo "════════════════════════════════════════"
echo " Hermes WA · Drive folder"
echo "════════════════════════════════════════"
echo "Folder:  $FOLDER_ID"
echo "URL:     $FOLDER_URL"
echo "Account: $ACCOUNT_HINT (must own or be shared the folder)"
echo "ArabicBuzz site brain folder is separate — do not change CranL for this."
echo ""

if [[ ! -x "$PY" ]]; then
  echo "❌ Missing $PY — create venv and install google-* packages (see docs/hermes-wa-drive.md)" >&2
  exit 1
fi
if [[ ! -f "$GSETUP" ]]; then
  echo "❌ google-workspace skill missing at $GSETUP" >&2
  exit 1
fi

if [[ "$MODE" == "status" ]]; then
  if [[ -f "$HERMES_HOME/google_client_secret.json" ]]; then
    echo "✅ google_client_secret.json present (local)"
  else
    echo "⚪ google_client_secret.json missing"
  fi
  if [[ -f "$HERMES_HOME/google_token.json" ]]; then
    echo "✅ google_token.json present"
  else
    echo "⚪ google_token.json missing — OAuth not finished"
  fi
  set +e
  out="$("$PY" "$GSETUP" --check 2>&1)"
  ec=$?
  set -e
  echo "setup --check: $out"
  if [[ "$ec" -eq 0 ]]; then
    echo "Link status: AUTHENTICATED (token ok) — run --probe to test folder access"
  else
    echo "Link status: NOT LINKED YET — run --auth-url, approve as $ACCOUNT_HINT, then --auth-code"
    echo "Google Cloud: add redirect URI http://localhost:1 to the OAuth client (or use a Desktop client)."
  fi
  exit 0
fi

if [[ "$MODE" == "auth-url" ]]; then
  url="$("$PY" "$GSETUP" --auth-url 2>/dev/null | tail -1)"
  echo "$url" >"$HERMES_HOME/google_oauth_last_url.txt"
  chmod 600 "$HERMES_HOME/google_oauth_last_url.txt"
  echo "Open this URL in a browser (sign in as $ACCOUNT_HINT):"
  echo "$url"
  echo ""
  echo "After approve, browser may error on localhost:1 — copy the FULL redirect URL,"
  echo "then: $0 --auth-code 'PASTE_URL_OR_CODE'"
  exit 0
fi

if [[ "$MODE" == "auth-code" ]]; then
  [[ -n "${CODE:-}" ]] || { echo "Missing code/url" >&2; exit 1; }
  "$PY" "$GSETUP" --auth-code "$CODE"
  "$PY" "$GSETUP" --check
  exit 0
fi

if [[ "$MODE" == "probe" ]]; then
  if [[ ! -x "$GAPI_WRAP" ]]; then
    echo "❌ missing $GAPI_WRAP" >&2
    exit 1
  fi
  echo "Probing folder metadata…"
  "$GAPI_WRAP" drive get "$FOLDER_ID"
  echo ""
  echo "Listing up to 10 children…"
  "$GAPI_WRAP" drive list-waqf 10
  echo "✅ Probe done"
  exit 0
fi
