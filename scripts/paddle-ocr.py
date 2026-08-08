#!/usr/bin/env python3
"""
Local PaddleOCR CLI for ArabicBuzz convert cascade.

JSON stdout:
  { "ok": true, "text": "...", "provider": "paddleocr" }
  { "ok": false, "error": "..." }

Install (heavy — do NOT bake into thin CranL image):
  pip install paddlepaddle paddleocr pillow

Prefer HTTP sidecar: scripts/paddle-ocr-bridge.py + PADDLE_OCR_URL
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Path to image or PDF")
    parser.add_argument("--lang", default="ar", help="PaddleOCR lang (ar/en/…)")
    args = parser.parse_args()
    path = Path(args.input)
    if not path.exists():
        print(
            json.dumps(
                {"ok": False, "error": f"file not found: {path}"},
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    try:
        from paddleocr import PaddleOCR  # type: ignore
    except ImportError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": (
                        f"paddleocr not installed ({e}). "
                        "pip install paddlepaddle paddleocr — "
                        "or set PADDLE_OCR_URL to a sidecar."
                    ),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(2)

    try:
        # PaddleOCR 2.x/3.x APIs differ; try common constructors.
        try:
            ocr = PaddleOCR(use_angle_cls=True, lang=args.lang, show_log=False)
        except TypeError:
            ocr = PaddleOCR(lang=args.lang)

        result = ocr.ocr(str(path))
        lines: list[str] = []
        if result:
            for page in result:
                if not page:
                    continue
                for item in page:
                    # Typical: [box, (text, confidence)]
                    try:
                        txt = item[1][0]
                    except Exception:
                        txt = ""
                    if txt:
                        lines.append(str(txt).strip())
        text = "\n".join(lines).strip()
        if not text:
            print(
                json.dumps(
                    {"ok": False, "error": "PaddleOCR returned empty text"},
                    ensure_ascii=False,
                )
            )
            sys.exit(3)
        print(
            json.dumps(
                {"ok": True, "text": text, "provider": "paddleocr"},
                ensure_ascii=False,
            )
        )
    except Exception as e:
        print(
            json.dumps(
                {"ok": False, "error": str(e)[:240]},
                ensure_ascii=False,
            )
        )
        sys.exit(4)


if __name__ == "__main__":
    main()
