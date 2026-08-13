#!/usr/bin/env bash
# Reliable CranL deploy + health verify for ArabicBuzz.
#
# Usage:
#   npm run cranl:deploy
#   ./scripts/cranl-deploy.sh
#   ./scripts/cranl-deploy.sh --skip-build
#   ./scripts/cranl-deploy.sh --no-wait
#
# Requires: cranl CLI logged in (or CRANL_API_KEY in env / .env.local / ~/.cranl/config.json)
# App id default: bf8cff03-49ac-4a80-bb93-298305e6617e
# Live: https://arabicbuzz-fooc9h.cranl.net/
#
# Auto-deploy from GitHub may lag or fail silently on Basic — this script always
# triggers `cranl apps deploy <app-id>` then polls health until ready.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ID="${CRANL_APP_ID:-bf8cff03-49ac-4a80-bb93-298305e6617e}"
LIVE_URL="${CRANL_LIVE_URL:-https://arabicbuzz-fooc9h.cranl.net}"
SKIP_BUILD=0
NO_WAIT=0
MAX_WAIT_SEC="${CRANL_DEPLOY_WAIT_SEC:-420}"

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-wait) NO_WAIT=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

echo "=== CranL deploy ==="
echo "app=$APP_ID"
echo "live=$LIVE_URL"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "── Typecheck / build gate (prisma generate + tsc --noEmit) ──"
  if [[ -f package.json ]] && command -v npx >/dev/null 2>&1; then
    npx prisma generate >/dev/null
    npx tsc --noEmit --pretty false
  fi
fi

if ! command -v cranl >/dev/null 2>&1; then
  echo "cranl CLI missing — install from https://docs.cranl.com" >&2
  exit 1
fi

echo "── Triggering cranl apps deploy ──"
set +e
deploy_out="$(cranl apps deploy "$APP_ID" 2>&1)"
deploy_rc=$?
set -e
echo "$deploy_out"
if [[ "$deploy_rc" -ne 0 ]]; then
  echo "Deploy trigger failed (exit $deploy_rc)" >&2
  exit "$deploy_rc"
fi

if [[ "$NO_WAIT" -eq 1 ]]; then
  echo "deploy_triggered=ok (no health wait)"
  exit 0
fi

echo "── Waiting for live health (up to ${MAX_WAIT_SEC}s) ──"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))
ok_live=0
ok_ready=0
while [[ $(date +%s) -lt $deadline ]]; do
  code_live="$(curl -sS -o /tmp/ab-cranl-live.json -w '%{http_code}' --max-time 15 "${LIVE_URL}/api/health/live" || echo 000)"
  code_ready="$(curl -sS -o /tmp/ab-cranl-ready.json -w '%{http_code}' --max-time 20 "${LIVE_URL}/api/health/ready" || echo 000)"
  if [[ "$code_live" == "200" ]]; then ok_live=1; fi
  if [[ "$code_ready" == "200" ]]; then ok_ready=1; fi
  echo "live=$code_live ready=$code_ready $(date -u +%H:%M:%SZ)"
  if [[ "$ok_live" -eq 1 && "$ok_ready" -eq 1 ]]; then
    break
  fi
  sleep 12
done

if [[ "$ok_live" -ne 1 || "$ok_ready" -ne 1 ]]; then
  echo "Health wait timed out — check npm run cranl:deployments" >&2
  exit 1
fi

echo "── Smoke free health (flags) ──"
curl -sS --max-time 30 "${LIVE_URL}/api/health/free" | head -c 1800 || true
echo
curl -sS --max-time 15 "${LIVE_URL}/api/crons/appointment-reminders" | head -c 600 || true
echo
echo "cranl_deploy=ok live_ready=ok"
echo "Verify: ${LIVE_URL}/"
