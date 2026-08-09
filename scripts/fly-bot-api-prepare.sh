#!/usr/bin/env bash
# Prepare-only checks for future Fly.io Telegram Bot API deploy.
# Does NOT create apps, deploy, or spend money.
#
# Usage (from repo root):
#   ./scripts/fly-bot-api-prepare.sh
#   npm run fly:bot-api:prepare

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "════════════════════════════════════════"
echo " Fly Bot API · prepare only (no deploy)"
echo "════════════════════════════════════════"
echo ""
echo "هذا السكربت يتحقق من الجاهزية فقط."
echo "لن ينفّذ fly deploy ولن يفتح فاتورة."
echo "للنشر لاحقاً فقط بطلب صريح: npm run telegram:bot-api:fly"
echo ""

ok=0
warn=0

check() {
  local label="$1"
  local okish="$2"
  if [[ "$okish" == "1" ]]; then
    echo "✅ $label"
    ok=$((ok + 1))
  else
    echo "⚪ $label"
    warn=$((warn + 1))
  fi
}

export PATH="${HOME}/.fly/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
FLY="$(command -v flyctl || command -v fly || true)"
if [[ -n "$FLY" ]]; then
  check "flyctl موجود ($FLY)" 1
  if "$FLY" auth whoami >/dev/null 2>&1; then
    check "fly auth whoami (مسجّل)" 1
  else
    check "fly auth whoami — شغّل fly auth login لاحقاً قبل النشر" 0
  fi
else
  check "flyctl غير مثبت — curl -L https://fly.io/install.sh | sh" 0
fi

has_id=0
has_hash=0
load_pair() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -qE '^TELEGRAM_API_ID=' "$f" 2>/dev/null; then has_id=1; fi
  if grep -qE '^TELEGRAM_API_HASH=' "$f" 2>/dev/null; then has_hash=1; fi
}
load_pair .env.local
load_pair .env
load_pair deploy/telegram-bot-api/.env
check "TELEGRAM_API_ID في env محلي" "$has_id"
check "TELEGRAM_API_HASH في env محلي" "$has_hash"

[[ -f deploy/telegram-bot-api/Dockerfile ]] && check "Dockerfile موجود" 1 || check "Dockerfile ناقص" 0
[[ -f deploy/telegram-bot-api/deploy-fly.sh ]] && check "deploy-fly.sh موجود (لا تشغّله الآن)" 1 || check "deploy-fly.sh ناقص" 0
[[ -f docs/fly-bot-api-prepare.md ]] && check "docs/fly-bot-api-prepare.md" 1 || true

echo ""
echo "الوضع الحالي (بدون Fly):"
echo "  npm run mac-hop:install"
echo "  npm run mac-hop:watchdog:force"
echo ""
echo "عند القرار بالنشر لاحقاً:"
echo "  1) اقرأ docs/fly-bot-api-prepare.md"
echo "  2) fly auth login"
echo "  3) npm run telegram:bot-api:fly   # فقط بطلب صريح"
echo ""
echo "نتيجة التحضير: $ok جاهز · $warn يحتاج خطوة لاحقاً"
echo "════════════════════════════════════════"
exit 0
