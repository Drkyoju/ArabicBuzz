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

# Gateway / WA
if [[ -f "$HERMES_HOME/gateway_state.json" ]]; then
  python3 - <<'PY' 2>/dev/null || true
import json, os
from pathlib import Path
p = Path(os.path.expanduser("~/.hermes/gateway_state.json"))
d = json.loads(p.read_text())
wa = (d.get("platforms") or {}).get("whatsapp") or {}
print(f"البوابة: {d.get('gateway_state') or d.get('kind') or '?'}")
print(f"واتساب: {wa.get('state') or '?'}")
PY
else
  echo "البوابة: (لا يوجد gateway_state.json)"
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

echo "مهارات محلية: wa-archive, wa-file-read, waqf-drive, ar-help"
echo "سكربتات: hermes-wa-drive-archive / hermes-file-read / hermes-jina-fetch"
echo "=== نهاية ==="
