#!/usr/bin/env python3
"""
Minimal LibreOffice convert HTTP sidecar for ArabicBuzz.
Keep out of the thin CranL app image — wire via CONVERT_SERVICE_URL / LIBREOFFICE_URL.

POST /convert  JSON: { contentBase64, filename, inputFormat, outputFormat }
GET  /health
"""
from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

PORT = int(os.environ.get("CONVERT_PORT", os.environ.get("PORT", "8100")))
SECRET = (os.environ.get("CONVERT_SECRET") or os.environ.get("LIBREOFFICE_SECRET") or "").strip()
SOFFICE = (
    os.environ.get("LIBREOFFICE_PATH")
    or os.environ.get("SOFFICE_PATH")
    or shutil.which("soffice")
    or shutil.which("libreoffice")
    or "/usr/bin/soffice"
)

ALLOWED = {
    "docx:pdf",
    "doc:pdf",
    "odt:pdf",
    "rtf:pdf",
    "pdf:docx",
    "xlsx:pdf",
    "xls:pdf",
    "ods:pdf",
    "pptx:pdf",
    "ppt:pdf",
    "odp:pdf",
    "docx:odt",
    "odt:docx",
    "xlsx:ods",
    "ods:xlsx",
    "pptx:odp",
    "odp:pptx",
    "csv:xlsx",
    "xlsx:csv",
    "txt:pdf",
    "txt:docx",
    "html:pdf",
    "html:docx",
}

MIME = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "odt": "application/vnd.oasis.opendocument.text",
    "ods": "application/vnd.oasis.opendocument.spreadsheet",
    "odp": "application/vnd.oasis.opendocument.presentation",
    "csv": "text/csv",
    "txt": "text/plain; charset=utf-8",
}


def _auth_ok() -> bool:
    if not SECRET:
        return True
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer ") and auth[7:].strip() == SECRET:
        return True
    if request.headers.get("apikey") == SECRET:
        return True
    if request.headers.get("x-convert-secret") == SECRET:
        return True
    return False


@app.get("/health")
def health():
    soffice_ok = Path(SOFFICE).exists() if "/" in SOFFICE else bool(shutil.which(SOFFICE))
    return jsonify(
        {
            "ok": soffice_ok,
            "engine": "libreoffice",
            "soffice": SOFFICE if soffice_ok else None,
            "messageAr": "خدمة تحويل LibreOffice جاهزة" if soffice_ok else "soffice غير موجود",
        }
    )


@app.post("/convert")
def convert():
    if not _auth_ok():
        return jsonify({"ok": False, "error": "unauthorized", "messageAr": "مفتاح التحويل غير صحيح"}), 401

    body = request.get_json(silent=True) or {}
    b64 = body.get("contentBase64") or body.get("content_base64")
    if not b64 or not isinstance(b64, str):
        return jsonify({"ok": False, "error": "missing_content", "messageAr": "مرّر contentBase64"}), 400

    filename = str(body.get("filename") or "input.bin")
    inp = str(body.get("inputFormat") or body.get("from") or Path(filename).suffix.lstrip(".")).lower()
    out = str(body.get("outputFormat") or body.get("to") or "").lower()
    if not out:
        return jsonify({"ok": False, "error": "missing_output", "messageAr": "مرّر outputFormat"}), 400
    if f"{inp}:{out}" not in ALLOWED:
        return jsonify(
            {
                "ok": False,
                "error": "unsupported_pair",
                "messageAr": f"LibreOffice لا يدعم {inp} → {out} في هذا المسار",
            }
        ), 400

    timeout_ms = int(body.get("timeoutMs") or 90_000)
    tmp = Path(tempfile.mkdtemp(prefix="ab-lo-"))
    try:
        in_path = tmp / f"input.{inp}"
        in_path.write_bytes(base64.b64decode(b64, validate=False))
        cmd = [
            SOFFICE,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--norestore",
            "--convert-to",
            out,
            "--outdir",
            str(tmp),
            str(in_path),
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=max(5, timeout_ms // 1000),
            env={**os.environ, "HOME": str(tmp)},
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "soffice failed")[:400]
            return jsonify({"ok": False, "error": "soffice_failed", "messageAr": f"فشل LibreOffice: {err}"}), 500

        candidates = [p for p in tmp.iterdir() if p.is_file() and p.name != in_path.name]
        out_file = next((p for p in candidates if p.suffix.lower() == f".{out}"), None) or (
            candidates[0] if candidates else None
        )
        if not out_file or out_file.stat().st_size == 0:
            return jsonify({"ok": False, "error": "no_output", "messageAr": "LibreOffice لم يُنتج ملفاً ناتجاً"}), 500

        base = Path(filename).stem or "converted"
        out_name = f"{base}.{out}"
        return jsonify(
            {
                "ok": True,
                "engine": "libreoffice-remote",
                "filename": out_name,
                "mimeType": MIME.get(out, "application/octet-stream"),
                "contentBase64": base64.b64encode(out_file.read_bytes()).decode("ascii"),
            }
        )
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "timeout", "messageAr": "انتهت مهلة تحويل LibreOffice"}), 504
    except Exception as e:  # noqa: BLE001
        return jsonify({"ok": False, "error": "exception", "messageAr": str(e)[:240]}), 500
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, threaded=True)
