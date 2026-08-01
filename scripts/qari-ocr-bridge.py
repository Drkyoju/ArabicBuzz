#!/usr/bin/env python3
"""
Optional Mac-side Arabic OCR bridge for Qari / Manazir.

This is a stub HTTP server you can replace with a real Manazir-OCR or
transformers Qari load. Arabic Buzz calls POST /ocr with JSON:
  { filename, mimeType, contentBase64, model }

Default port: 7430  → set QARI_OCR_URL=http://127.0.0.1:7430 on Netlify/.env

Install (GPU Mac / Linux recommended for real Qari):
  pip install flask pillow
  # then Manazir-OCR or transformers+qwen-vl for NAMAA-Space/Qari-OCR-*

Until a real model is wired, this stub returns 501 so Gemini/HF cascade runs.
"""
from __future__ import annotations

import base64
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("QARI_OCR_PORT", "7430"))
SECRET = os.environ.get("QARI_OCR_SECRET", "").strip()


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
        self._json(
            200,
            {
                "ok": True,
                "agent": "arabic-buzz-qari-bridge",
                "hint": "Wire Manazir-OCR or Qari transformers here",
                "model": os.environ.get(
                    "QARI_OCR_MODEL",
                    "NAMAA-Space/Qari-OCR-v0.3-VL-2B-Instruct",
                ),
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
            _ = base64.b64decode(b64)
        except Exception:
            self._json(400, {"error": "bad contentBase64"})
            return

        # Placeholder: implement real Qari inference here.
        self._json(
            501,
            {
                "error": (
                    "Qari bridge stub — install Manazir-OCR / transformers "
                    "and replace this handler, or use HF_TOKEN / GEMINI_API_KEY "
                    "in Arabic Buzz for cloud OCR."
                ),
                "text": "",
            },
        )

    def log_message(self, fmt: str, *args) -> None:
        print(f"[qari-bridge] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    print(f"Arabic Buzz Qari OCR bridge on http://127.0.0.1:{PORT}")
    print("Replace stub with Manazir-OCR / Qari for local SOTA Arabic OCR.")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
