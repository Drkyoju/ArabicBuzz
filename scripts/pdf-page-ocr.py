#!/usr/bin/env python3
"""
Page OCR for Arabic+English PDFs/images via PyMuPDF + Tesseract.

Usage (CLI):
  scripts/pdf-tools-venv/bin/python scripts/pdf-page-ocr.py input.pdf --page 1 --lang ara+eng

JSON stdout:
  { "ok": true, "page": 1, "text": "...", "provider": "tesseract-ara+eng" }

Mac sync agent calls this for POST /pdf-page-ocr.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


def find_tesseract() -> str | None:
    env = os.environ.get("TESSERACT_CMD", "").strip()
    if env and Path(env).exists():
        return env
    candidates = [
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        "/usr/bin/tesseract",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    # which
    import shutil

    return shutil.which("tesseract")


def ocr_image(path: Path, lang: str) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError as e:
        raise SystemExit(
            json.dumps(
                {
                    "ok": False,
                    "error": f"missing deps: {e}. pip install pytesseract pillow",
                },
                ensure_ascii=False,
            )
        )

    tess = find_tesseract()
    if not tess:
        raise SystemExit(
            json.dumps(
                {
                    "ok": False,
                    "error": "tesseract not found. brew install tesseract tesseract-lang",
                },
                ensure_ascii=False,
            )
        )
    pytesseract.pytesseract.tesseract_cmd = tess
    img = Image.open(path)
    # PSM 6 = assume uniform block of text — good for bylaws pages
    config = "--psm 6"
    text = pytesseract.image_to_string(img, lang=lang, config=config)
    return (text or "").strip()


def render_pdf_page(pdf_path: Path, page: int, dpi: int = 200) -> Path:
    import pymupdf  # noqa: F401 — prefer new name
    import fitz

    doc = fitz.open(pdf_path)
    if page < 1 or page > doc.page_count:
        raise ValueError(f"page {page} out of range 1..{doc.page_count}")
    p = doc.load_page(page - 1)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = p.get_pixmap(matrix=mat, alpha=False)
    out = Path(tempfile.mkdtemp(prefix="ab-ocr-")) / f"page-{page}.png"
    pix.save(str(out))
    doc.close()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--page", type=int, default=1)
    ap.add_argument("--lang", default=os.environ.get("TESSERACT_OCR_LANG", "ara+eng"))
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--all-pages", action="store_true")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        print(json.dumps({"ok": False, "error": f"missing file: {src}"}, ensure_ascii=False))
        sys.exit(1)

    lang = args.lang
    suffix = src.suffix.lower()

    try:
        if suffix == ".pdf":
            if args.all_pages:
                import fitz

                doc = fitz.open(src)
                parts = []
                for i in range(1, doc.page_count + 1):
                    img = render_pdf_page(src, i, args.dpi)
                    t = ocr_image(img, lang)
                    parts.append(f"--- صفحة {i} ---\n{t}")
                    try:
                        img.unlink(missing_ok=True)
                    except Exception:
                        pass
                doc.close()
                text = "\n\n".join(parts)
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "page": 0,
                            "pages": len(parts),
                            "text": text,
                            "provider": f"tesseract-{lang}",
                        },
                        ensure_ascii=False,
                    )
                )
                return

            img = render_pdf_page(src, args.page, args.dpi)
            text = ocr_image(img, lang)
            try:
                img.unlink(missing_ok=True)
            except Exception:
                pass
            print(
                json.dumps(
                    {
                        "ok": True,
                        "page": args.page,
                        "text": text,
                        "provider": f"tesseract-{lang}",
                    },
                    ensure_ascii=False,
                )
            )
            return

        # Single image
        text = ocr_image(src, lang)
        print(
            json.dumps(
                {
                    "ok": True,
                    "page": 1,
                    "text": text,
                    "provider": f"tesseract-{lang}",
                },
                ensure_ascii=False,
            )
        )
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
