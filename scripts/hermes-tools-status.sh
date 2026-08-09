#!/usr/bin/env bash
# Quick Hermes tools health (no secrets). Safe to paste a short summary into WhatsApp.
#
# Usage:
#   ./scripts/hermes-tools-status.sh
#   npm run hermes:tools:status

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$HERMES_HOME/config.yaml"
GAPI="${HERMES_GAPI:-$HERMES_HOME/bin/hermes-gapi}"
FOLDER_ID="${HERMES_DRIVE_FOLDER_ID:-1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw}"

echo "=== هيرميس — حالة الأدوات (بلا أسرار) ==="
echo "المنزل: $HERMES_HOME"

# Gateway / WA (prefer live bridge /health — gateway_state can lag mid-restart)
WA_LIVE=""
if command -v curl >/dev/null 2>&1; then
  WA_LIVE="$(curl -sS -m 2 http://127.0.0.1:3000/health 2>/dev/null || true)"
fi
export WA_LIVE_JSON="$WA_LIVE"
if [[ -f "$HERMES_HOME/gateway_state.json" ]]; then
  python3 - <<'PY' 2>/dev/null || true
import json, os, re
from pathlib import Path
p = Path(os.path.expanduser("~/.hermes/gateway_state.json"))
d = json.loads(p.read_text())
wa = (d.get("platforms") or {}).get("whatsapp") or {}
tg = (d.get("platforms") or {}).get("telegram") or {}
print(f"البوابة: {d.get('gateway_state') or d.get('kind') or '?'}")
state = wa.get('state') or '?'
live = os.environ.get("WA_LIVE_JSON", "")
m = re.search(r'"status"\s*:\s*"([^"]+)"', live or "")
if m:
    state = m.group(1)
print(f"واتساب: {state}")
print(f"تيليجرام هيرميس: {tg.get('state') or 'disconnected'} (يجب أن يبقى مفصولاً)")
PY
else
  echo "البوابة: (لا يوجد gateway_state.json)"
  if [[ -n "$WA_LIVE" ]]; then
    echo "واتساب: $(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("status","?"))' "$WA_LIVE" 2>/dev/null || echo '?')"
  fi
fi

# Anti-ban flags (names only)
echo "anti-ban: require_mention + ignore stranger DMs (انظر config.yaml)"

# MCP enabled names from yaml (simple parse)
if [[ -f "$CFG" ]]; then
  echo -n "MCP مفعّل: "
  python3 - <<'PY'
import re
from pathlib import Path
text = Path.home().joinpath(".hermes/config.yaml").read_text()
# crude: under mcp_servers, name: then later enabled: true/false
block = text.split("mcp_servers:", 1)[-1]
# stop at next top-ish comment section that isn't indented under mcp — take until "# ──" after mcp
parts = re.split(r"\n# ──", block, maxsplit=1)
block = parts[0]
names = []
cur = None
enabled = None
for line in block.splitlines():
    m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
    if m:
        if cur is not None and enabled is True:
            names.append(cur)
        cur = m.group(1)
        enabled = None
        continue
    m2 = re.match(r"^    enabled:\s*(true|false)\s*$", line)
    if m2 and cur:
        enabled = m2.group(1) == "true"
if cur is not None and enabled is True:
    names.append(cur)
print(", ".join(names) if names else "(لا شيء)")
PY
fi

# Local tools
echo -n "ffmpeg: "
if command -v ffmpeg >/dev/null 2>&1; then
  echo "نعم ($(ffmpeg -version 2>&1 | head -1 | tr -d '\n' | cut -c1-60))"
else
  echo "لا — ضع ثنائياً في ~/.hermes/bin/ffmpeg"
fi

echo -n "tesseract: "
if command -v tesseract >/dev/null 2>&1; then
  echo "نعم ($(tesseract --version 2>&1 | head -1 | tr -d '\n')) ara+eng"
else
  echo "لا"
fi

echo -n "docs-venv OCR: "
if "$HERMES_HOME/docs-venv/bin/python" -c "import PIL, pytesseract" 2>/dev/null; then
  echo "pillow+pytesseract جاهز"
else
  echo "ناقص — pip install pillow pytesseract داخل docs-venv"
fi

echo -n "STT local (faster-whisper): "
STT_PY="$HERMES_HOME/hermes-agent/venv/bin/python"
if [[ -x "$STT_PY" ]] && "$STT_PY" -c "import faster_whisper" 2>/dev/null; then
  if [[ -f "$CFG" ]] && rg -q 'provider:\s*local' "$CFG" 2>/dev/null; then
    echo "جاهز (config provider=local, language=ar)"
  else
    echo "الحزمة موجودة لكن config ليست local — راجع stt في config.yaml"
  fi
else
  echo "ناقص في hermes-agent/venv"
fi

echo -n "Drive folder: $FOLDER_ID — "
if [[ -x "$GAPI" ]]; then
  if "$GAPI" drive list-waqf 1 >/dev/null 2>&1; then
    echo "قائمة OK"
  else
    echo "فشل list-waqf (أعد --from-arabicbuzz إن لزم)"
  fi
else
  echo "hermes-gapi مفقود"
fi

echo -n "hermes-storage-mesh: "
if [[ -x "$HERMES_HOME/bin/hermes-storage-mesh" ]] || command -v hermes-storage-mesh >/dev/null 2>&1; then
  echo "نعم"
else
  echo "لا (wrappers في ~/.hermes/bin)"
fi
echo -n "hermes-pdf-dup: "
if [[ -x "$HERMES_HOME/bin/hermes-pdf-dup" ]] || command -v hermes-pdf-dup >/dev/null 2>&1; then
  echo "نعم"
else
  echo "لا"
fi
echo "مهارات محلية: wa-archive, wa-file-read, wa-storage-mesh, wa-pdf-dup, waqf-drive, ar-help, wa-tools"
echo "مهارات GitHub/رسمية إضافية: duckduckgo-search, domain-intel, scrapling, code-wiki, arxiv (+ pdf/docx/xlsx/ocr مدمجة)"
echo "MCP مجاني: filesystem, memory, sequential-thinking, duckduckgo, fetch, wikipedia, math, youtube-transcript, dns, arxiv, context7, time"
echo "سكربتات: hermes-wa-drive-archive / hermes-file-read / hermes-jina-fetch / hermes-storage-mesh / hermes-pdf-dup"
echo "فصل: هيرميس واتساب ≠ @alhuda14bot (نفس القدرات تقريباً — بلا ربط)"
echo "=== نهاية ==="
