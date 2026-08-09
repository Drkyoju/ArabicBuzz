#!/usr/bin/env bash
# Prepare (do NOT force) a dedicated WhatsApp number for Hermes — Baileys only.
# Never Meta Cloud. Does not buy a SIM. Keeps current session unless --isolate.
#
# Usage:
#   ./scripts/hermes-wa-prepare-dedicated.sh           # checklist + backup hint
#   ./scripts/hermes-wa-prepare-dedicated.sh --backup  # backup current session only
#   ./scripts/hermes-wa-prepare-dedicated.sh --isolate # stop gateway, move session aside, ready for new QR
#   npm run hermes:wa:prepare-dedicated
#
# After --isolate: run `hermes whatsapp` and scan QR from the NEW number.
# To undo: ./scripts/hermes-backup-wa-session.sh --restore <archive.tgz>
#   or move session-aside-* back to platforms/whatsapp/session

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="$HERMES_HOME/platforms/whatsapp/session"
ASIDE_ROOT="$HERMES_HOME/platforms/whatsapp"
MODE=checklist
export PATH="$HERMES_HOME/hermes-agent/venv/bin:$HOME/.local/bin:$HERMES_HOME/bin:$PATH"

for arg in "$@"; do
  case "$arg" in
    --backup) MODE=backup ;;
    --isolate) MODE=isolate ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

echo "════════════════════════════════════════"
echo " هيرميس · رقم واتساب مخصص (تحضير)"
echo "════════════════════════════════════════"
echo "الوضع الحالي مسموح: الإبقاء على الرقم المرتبط الآن."
echo "لا Meta Cloud. لا شراء شريحة إجباري."
echo "التوثيق: docs/hermes-wa-dedicated-number.md"
echo ""

if [[ ! -d "$HERMES_HOME" ]]; then
  echo "❌ HERMES_HOME غير موجود: $HERMES_HOME" >&2
  exit 1
fi

echo "-- جلسة Baileys --"
if [[ -d "$SESSION" ]]; then
  echo "  موجودة: $SESSION"
else
  echo "  لا جلسة بعد — hermes whatsapp لربط أول رقم"
fi

if [[ "$MODE" == "checklist" ]]; then
  cat <<'EOF'

خطوات اختيارية لاحقاً (عندما تقرّر رقمًا ثانيًا):
  1) npm run hermes:backup:wa
  2) npm run hermes:wa:prepare-dedicated -- --isolate
  3) hermes whatsapp          # امسح QR من هاتف الرقم الجديد فقط
  4) حدّث WHATSAPP_ALLOWED_USERS في ~/.hermes/.env (رقم المالك)
  5) انضم لقروب عمل الوقف → ./scripts/hermes-wa-allowlist-sync.sh --add '…@g.us'
  6) اختبر @منشن — رد واحد قصير
  7) أبقِ REQUIRE_MENTION=true و CHUNK_DELAY

الرقم الحالي يبقى يعمل ما لم تشغّل --isolate.
EOF
  exit 0
fi

if [[ "$MODE" == "backup" || "$MODE" == "isolate" ]]; then
  echo "Backing up current WA session…"
  bash "$ROOT/scripts/hermes-backup-wa-session.sh" || true
fi

if [[ "$MODE" == "backup" ]]; then
  echo "✅ Backup done. Current session untouched."
  exit 0
fi

# isolate
if [[ ! -d "$SESSION" ]]; then
  echo "لا جلسة لنقلها — جاهز لـ hermes whatsapp على رقم جديد."
  exit 0
fi

stamp="$(date +%Y%m%d-%H%M%S)"
aside="$ASIDE_ROOT/session-aside-$stamp"
echo "Stopping Hermes gateway (gentle)…"
if command -v hermes >/dev/null 2>&1; then
  hermes gateway stop 2>/dev/null || true
  sleep 2
fi

mkdir -p "$ASIDE_ROOT"
mv "$SESSION" "$aside"
echo "✅ Moved current session aside → $aside"
echo "   Current link (+966…) is paused until you restore or re-scan that phone."
echo ""
echo "Next:"
echo "  hermes whatsapp     # QR from DEDICATED number only"
echo "  # undo: mv \"$aside\" \"$SESSION\" && hermes gateway restart"
echo "  # or: ./scripts/hermes-backup-wa-session.sh --restore ~/Backups/hermes-wa/….tgz"
