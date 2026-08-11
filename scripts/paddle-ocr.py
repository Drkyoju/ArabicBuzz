#!/usr/bin/env python3
"""
Local PaddleOCR CLI for ArabicBuzz (Apache-2.0 paddleocr).

Prefer PP-OCRv5 Arabic when available; fall back to best `ar`/`arabic` model.

JSON stdout:
  { "ok": true, "text": "...", "provider": "paddleocr", "lang": "arabic" }
  { "ok": false, "error": "..." }

Install on Mac hop (heavy — NOT in thin CranL image):
  python3.11 -m venv scripts/paddle-ocr-venv
  scripts/paddle-ocr-venv/bin/pip install paddlepaddle paddleocr pillow

Prefer mac-sync POST /ocr/paddle (same script) or:
  PADDLE_OCR_URL → scripts/paddle-ocr-bridge.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _langs_for(requested: str) -> list[str]:
    r = (requested or "ar").strip().lower()
    if r in ("ar", "ara", "arabic", "ar-ar"):
        # PP-OCRv5 / PaddleOCR 3.x often use "arabic"; 2.x uses "ar".
        return ["arabic", "ar"]
    return [requested]


def _extract_lines(result) -> list[str]:
    lines: list[str] = []
    if result is None:
        return lines

    # PaddleOCR 3.x: list of dict-like OCRResult with rec_texts
    if isinstance(result, list) and result and isinstance(result[0], dict):
        for page in result:
            texts = page.get("rec_texts") or page.get("texts") or []
            for t in texts:
                s = str(t).strip()
                if s:
                    lines.append(s)
        if lines:
            return lines

    # Classic 2.x: [[[box, (text, conf)], ...], ...]
    if isinstance(result, list):
        for page in result:
            if not page:
                continue
            if isinstance(page, dict):
                texts = page.get("rec_texts") or page.get("texts") or []
                for t in texts:
                    s = str(t).strip()
                    if s:
                        lines.append(s)
                continue
            for item in page:
                try:
                    txt = item[1][0]
                except Exception:
                    txt = ""
                if txt:
                    lines.append(str(txt).strip())
    return lines


def _make_ocr(lang: str):
    from paddleocr import PaddleOCR  # type: ignore

    # PaddleOCR 2.x vs 3.x kwargs differ — try progressively simpler.
    attempts = [
        {"lang": lang, "use_textline_orientation": True},
        {"lang": lang, "use_angle_cls": True},
        {"lang": lang},
    ]
    last_err: Exception | None = None
    for kwargs in attempts:
        try:
            return PaddleOCR(**kwargs)
        except Exception as e:
            last_err = e
            continue
    raise last_err or RuntimeError("PaddleOCR init failed")


def _run_ocr(path: Path, lang: str) -> tuple[str, str]:
    last_err: Exception | None = None
    for candidate in _langs_for(lang):
        try:
            ocr = _make_ocr(candidate)

            result = None
            if hasattr(ocr, "predict"):
                try:
                    result = ocr.predict(str(path))
                except Exception:
                    result = None
            if result is None and hasattr(ocr, "ocr"):
                try:
                    result = ocr.ocr(str(path))
                except TypeError:
                    result = ocr.ocr(str(path), cls=True)

            text = "\n".join(_extract_lines(result)).strip()
            if text:
                return text, candidate
            last_err = RuntimeError(f"empty OCR for lang={candidate}")
        except Exception as e:
            last_err = e
            continue
    raise last_err or RuntimeError("PaddleOCR failed for all langs")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Path to image or PDF")
    parser.add_argument(
        "--lang",
        default="ar",
        help="PaddleOCR lang (ar/arabic → PP-OCRv5 arabic if available)",
    )
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
        from paddleocr import PaddleOCR  # noqa: F401
    except ImportError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": (
                        f"paddleocr not installed ({e}). "
                        "pip install paddlepaddle paddleocr — "
                        "or set PADDLE_OCR_URL / use mac-hop POST /ocr/paddle."
                    ),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(2)

    try:
        text, used_lang = _run_ocr(path, args.lang)
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
                {
                    "ok": True,
                    "text": text,
                    "provider": "paddleocr",
                    "lang": used_lang,
                },
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
