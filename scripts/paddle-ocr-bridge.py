#!/usr/bin/env python3
"""
Optional HTTP sidecar for PaddleOCR (keep thin CranL image free of paddlepaddle).

Arabic Buzz calls POST /ocr (or /ocr/paddle) with JSON:
  { filename, mimeType, contentBase64, lang? }

Env:
  PADDLE_OCR_PORT=7440
  PADDLE_OCR_SECRET=
  PADDLE_OCR_LANG=ar   # arabic / ar → prefer PP-OCRv5 arabic

Install on the sidecar host (Mac hop preferred):
  python3.11 -m venv scripts/paddle-ocr-venv
  scripts/paddle-ocr-venv/bin/pip install paddlepaddle paddleocr pillow

Then set on CranL (optional if MAC_SYNC_URL already hops /ocr/paddle):
  PADDLE_OCR_URL=https://your-tunnel-or-host:7440
"""
from __future__ import annotations

import base64
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = int(os.environ.get("PADDLE_OCR_PORT", "7440"))
SECRET = os.environ.get("PADDLE_OCR_SECRET", "").strip()
DEFAULT_LANG = os.environ.get("PADDLE_OCR_LANG", "ar").strip() or "ar"

_OCR = None
_OCR_LANG = None


def _langs_for(requested: str) -> list[str]:
    r = (requested or "ar").strip().lower()
    if r in ("ar", "ara", "arabic", "ar-ar"):
        return ["arabic", "ar"]
    return [requested]


def _extract_lines(result) -> list[str]:
    lines: list[str] = []
    if result is None:
        return lines
    if isinstance(result, list) and result and isinstance(result[0], dict):
        for page in result:
            texts = page.get("rec_texts") or page.get("texts") or []
            for t in texts:
                s = str(t).strip()
                if s:
                    lines.append(s)
        if lines:
            return lines
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


def get_ocr(lang: str):
    global _OCR, _OCR_LANG
    if _OCR is not None and _OCR_LANG == lang:
        return _OCR
    from paddleocr import PaddleOCR  # type: ignore

    last_err: Exception | None = None
    for candidate in _langs_for(lang):
        attempts = [
            {"lang": candidate, "use_textline_orientation": True},
            {"lang": candidate, "use_angle_cls": True},
            {"lang": candidate},
        ]
        for kwargs in attempts:
            try:
                ocr = PaddleOCR(**kwargs)
                _OCR = ocr
                _OCR_LANG = candidate
                return _OCR
            except Exception as e:
                last_err = e
                continue
    raise last_err or RuntimeError("failed to init PaddleOCR")


def run_ocr(path: Path, lang: str) -> str:
    ocr = get_ocr(lang)
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
    return "\n".join(_extract_lines(result)).strip()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )
        self.end_headers()

    def do_GET(self) -> None:
        paddle_ok = False
        err = None
        try:
            import paddleocr  # noqa: F401

            paddle_ok = True
        except Exception as e:
            err = str(e)[:160]
        self._json(
            200,
            {
                "ok": True,
                "agent": "arabic-buzz-paddle-ocr-bridge",
                "paddleInstalled": paddle_ok,
                "paddle": paddle_ok,
                "error": err,
                "lang": DEFAULT_LANG,
            },
        )

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path not in ("/ocr", "/ocr/paddle", "/"):
            self._json(404, {"error": "not found — use POST /ocr or /ocr/paddle"})
            return
        if SECRET:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {SECRET}":
                self._json(401, {"error": "unauthorized"})
                return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(400, {"error": "invalid json"})
            return

        b64 = data.get("contentBase64") or ""
        try:
            blob = base64.b64decode(b64)
        except Exception:
            self._json(400, {"error": "bad contentBase64"})
            return

        filename = str(data.get("filename") or "doc.bin")
        mime = str(data.get("mimeType") or "")
        lang = str(data.get("lang") or DEFAULT_LANG)
        lower = filename.lower()
        if "pdf" in mime or lower.endswith(".pdf"):
            suffix = ".pdf"
        elif lower.endswith(
            (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp")
        ):
            suffix = Path(lower).suffix or ".png"
        else:
            suffix = ".png"

        try:
            with tempfile.TemporaryDirectory(prefix="ab-paddle-") as td:
                path_f = Path(td) / f"input{suffix}"
                path_f.write_bytes(blob)
                text = run_ocr(path_f, lang)
            if not text:
                self._json(422, {"text": "", "error": "empty OCR"})
                return
            self._json(
                200,
                {
                    "text": text,
                    "provider": "paddleocr",
                    "lang": _OCR_LANG or lang,
                },
            )
        except ImportError as e:
            self._json(
                501,
                {
                    "text": "",
                    "error": (
                        f"paddleocr missing: {e}. "
                        "pip install paddlepaddle paddleocr"
                    ),
                },
            )
        except Exception as e:
            self._json(500, {"text": "", "error": str(e)[:240]})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[paddle-bridge] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    print(f"Arabic Buzz PaddleOCR bridge on http://127.0.0.1:{PORT}")
    print("Set PADDLE_OCR_URL on CranL to this host (via tunnel if needed).")
    print("Or use mac-sync POST /ocr/paddle on MAC_SYNC_URL.")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
