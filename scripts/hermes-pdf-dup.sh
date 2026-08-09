#!/usr/bin/env bash
# Duplicate / insert a PDF page locally for Hermes WA (parallel to pdf_duplicate_page).
# Uses pymupdf in ~/.hermes/docs-venv — no ArabicBuzz HTTP, no Telegram.
#
# Usage:
#   ./scripts/hermes-pdf-dup.sh INPUT.pdf --copy-page N --after-page M [--out OUT.pdf]
#   ./scripts/hermes-pdf-dup.sh INPUT.pdf --find-empty --after-page M [--out OUT.pdf]
#   ./scripts/hermes-pdf-dup.sh INPUT.pdf --blank --after-page M [--out OUT.pdf]
#
# Pages are 1-based (matching ArabicBuzz pdf_duplicate_page).
# find-empty: body-empty leaf (header/logo OK); refuses inventing blank unless --blank.

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PY="${HERMES_DOCS_PYTHON:-$HERMES_HOME/docs-venv/bin/python}"
export PATH="$HERMES_HOME/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

INPUT=""
OUT=""
COPY_PAGE=""
AFTER_PAGE=""
FIND_EMPTY=0
BLANK=0

usage() {
  sed -n '2,14p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy-page) COPY_PAGE="${2:-}"; shift 2 ;;
    --after-page) AFTER_PAGE="${2:-}"; shift 2 ;;
    --find-empty) FIND_EMPTY=1; shift ;;
    --blank) BLANK=1; shift ;;
    --out|-o) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$INPUT" ]]; then
        INPUT="$1"
        shift
      else
        echo "Unknown arg: $1" >&2
        exit 1
      fi
      ;;
  esac
done

[[ -n "$INPUT" && -f "$INPUT" ]] || { echo "Missing INPUT.pdf" >&2; usage; exit 1; }
[[ -n "$AFTER_PAGE" ]] || { echo "Missing --after-page N" >&2; exit 1; }
[[ -x "$PY" ]] || {
  echo "❌ missing $PY — pip install pymupdf inside docs-venv" >&2
  exit 1
}

if [[ -z "$OUT" ]]; then
  base="${INPUT%.*}"
  OUT="${base}-نسخ-$(date -u +%Y%m%d-%H%M%S).pdf"
fi

export HERMES_PDF_DUP_IN="$INPUT"
export HERMES_PDF_DUP_OUT="$OUT"
export HERMES_PDF_DUP_COPY="${COPY_PAGE:-}"
export HERMES_PDF_DUP_AFTER="$AFTER_PAGE"
export HERMES_PDF_DUP_FIND_EMPTY="$FIND_EMPTY"
export HERMES_PDF_DUP_BLANK="$BLANK"

"$PY" - <<'PY'
import os, json, re, sys
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz  # type: ignore
    except ImportError:
        print(json.dumps({"ok": False, "errorAr": "pymupdf غير مثبت في docs-venv"}, ensure_ascii=False))
        sys.exit(1)

inp = Path(os.environ["HERMES_PDF_DUP_IN"])
out = Path(os.environ["HERMES_PDF_DUP_OUT"])
after = int(os.environ["HERMES_PDF_DUP_AFTER"])
copy_raw = os.environ.get("HERMES_PDF_DUP_COPY") or ""
find_empty = os.environ.get("HERMES_PDF_DUP_FIND_EMPTY") == "1"
blank = os.environ.get("HERMES_PDF_DUP_BLANK") == "1"

doc = fitz.open(inp)
src = fitz.open(inp)  # separate handle — insert_pdf forbids same object
n = doc.page_count
if after < 0 or after > n:
    print(json.dumps({"ok": False, "errorAr": f"after-page خارج النطاق (1..{n} أو 0=قبل الأولى)"}, ensure_ascii=False))
    sys.exit(1)

# after=0 → insert at start; after=k → after page k (1-based)
insert_at = after  # pymupdf insert uses 0-based index = after

def body_text(page) -> str:
    t = page.get_text("text") or ""
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    body = [ln for ln in lines if len(ln) >= 8]
    return "\n".join(body)

def is_empty_leaf(page) -> bool:
    body = body_text(page)
    if not body:
        return True
    if re.search(r"بسم\s*الله", body):
        return False
    return len(body) < 40

src_page = None  # 0-based
mode = "duplicate"

if blank:
    mode = "blank"
elif find_empty:
    mode = "findEmpty"
    for i in range(n):
        if is_empty_leaf(doc[i]):
            src_page = i
            break
    if src_page is None:
        print(json.dumps({
            "ok": False,
            "errorAr": "لم تُوجد صفحة فاضية (متن فارغ) في الملف — لن أختلق صفحة بيضاء.",
            "pages": n,
        }, ensure_ascii=False))
        sys.exit(2)
elif copy_raw:
    src_page = int(copy_raw) - 1
    if src_page < 0 or src_page >= n:
        print(json.dumps({"ok": False, "errorAr": f"copy-page خارج النطاق 1..{n}"}, ensure_ascii=False))
        sys.exit(1)
else:
    print(json.dumps({"ok": False, "errorAr": "مرّر --copy-page أو --find-empty أو --blank"}, ensure_ascii=False))
    sys.exit(1)

if mode == "blank":
    ref = doc[min(max(after - 1, 0), n - 1)] if n else None
    rect = ref.rect if ref is not None else fitz.Rect(0, 0, 595, 842)
    doc.new_page(pno=insert_at, width=rect.width, height=rect.height)
    used = None
else:
    doc.insert_pdf(src, from_page=src_page, to_page=src_page, start_at=insert_at)
    used = src_page + 1

doc.save(out)
src.close()
doc.close()

print(json.dumps({
    "ok": True,
    "mode": mode,
    "sourcePage": used,
    "afterPage": after,
    "out": str(out),
    "messageAr": (
        f"أُدرجت صفحة بيضاء بعد {after}." if mode == "blank"
        else f"نُسخت الصفحة {used} وأُدرجت بعد {after}."
    ),
}, ensure_ascii=False))
PY
