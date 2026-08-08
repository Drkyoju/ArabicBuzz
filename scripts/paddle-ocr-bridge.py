#!/usr/bin/env python3
"""
Optional HTTP sidecar for PaddleOCR (keep thin CranL image free of paddlepaddle).

Arabic Buzz calls POST /ocr with JSON:
  { filename, mimeType, contentBase64, lang? }

Env:
  PADDLE_OCR_PORT=7440
  PADDLE_OCR_SECRET=
  PADDLE_OCR_LANG=ar

Install on the sidecar host (GPU recommended):
  pip install flask pillow paddlepaddle paddleocr

Then set on CranL:
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


def get_ocr(lang: str):
    global _OCR
    if _OCR is not None:
        return _OCR
    from paddleocr import PaddleOCR  # type: ignore

    try:
        _OCR = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    except TypeError:
        _OCR = PaddleOCR(lang=lang)
    return _OCR


def run_ocr(path: Path, lang: str) -> str:
    ocr = get_ocr(lang)
    result = ocr.ocr(str(path))
    lines: list[str] = []
    if result:
        for page in result:
            if not page:
                continue
            for item in page:
                try:
                    txt = item[1][0]
                except Exception:
                    txt = ""
                if txt:
                    lines.append(str(txt).strip())
    return "\n".join(lines).strip()


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
                "error": err,
                "lang": DEFAULT_LANG,
            },
        )

    def do_POST(self) -> None:
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
        elif lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp")):
            suffix = Path(lower).suffix or ".png"
        else:
            suffix = ".png"

        try:
            with tempfile.TemporaryDirectory(prefix="ab-paddle-") as td:
                path = Path(td) / f"input{suffix}"
                path.write_bytes(blob)
                text = run_ocr(path, lang)
            if not text:
                self._json(422, {"text": "", "error": "empty OCR"})
                return
            self._json(200, {"text": text, "provider": "paddleocr"})
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
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
