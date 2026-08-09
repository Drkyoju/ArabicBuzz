#!/usr/bin/env bash
# Free local file reading for Hermes (PDF text layer, DOCX, plain text, light OCR, local STT).
# OCR uses system tesseract (ara+eng) + pillow — not marker-pdf (~5GB).
# Scanned PDFs: OCR first N pages only (default 3) to stay light.
# Audio: local faster-whisper via Hermes venv (language ar) when ffmpeg/STT available.
#
# Usage:
#   ./scripts/hermes-file-read.sh /path/to/file.pdf [--max-chars N] [--ocr-pages N] [--no-ocr]
#   ./scripts/hermes-file-read.sh /path/to/file.docx
#   ./scripts/hermes-file-read.sh /path/to/scan.png
#   ./scripts/hermes-file-read.sh /path/to/voice.ogg
#
# Env:
#   HERMES_DOCS_PYTHON  default: ~/.hermes/docs-venv/bin/python
#   HERMES_STT_PYTHON   default: ~/.hermes/hermes-agent/venv/bin/python
#   HERMES_HOME         default: ~/.hermes
#   HERMES_OCR_LANGS    default: ara+eng
#   HERMES_OCR_PAGES    default: 3 (scanned PDF page cap)
#   HERMES_STT_LANG     default: ar
#   HERMES_STT_MODEL    default: base

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PY="${HERMES_DOCS_PYTHON:-$HERMES_HOME/docs-venv/bin/python}"
STT_PY="${HERMES_STT_PYTHON:-$HERMES_HOME/hermes-agent/venv/bin/python}"
# Prefer Hermes-bundled static ffmpeg, then PATH
export PATH="$HERMES_HOME/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
FILE=""
MAX_CHARS=12000
OCR_PAGES="${HERMES_OCR_PAGES:-3}"
NO_OCR=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-chars) MAX_CHARS="${2:-12000}"; shift 2 ;;
    --ocr-pages) OCR_PAGES="${2:-3}"; shift 2 ;;
    --no-ocr) NO_OCR=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      FILE="$1"
      shift
      ;;
  esac
done

[[ -n "$FILE" && -f "$FILE" ]] || { echo "Usage: $0 /path/to/file [--max-chars N] [--ocr-pages N] [--no-ocr]" >&2; exit 1; }
[[ -x "$PY" ]] || {
  echo "❌ missing $PY — create with:" >&2
  echo "  python3 -m venv \$HOME/.hermes/docs-venv && \$HOME/.hermes/docs-venv/bin/pip install pypdf pymupdf python-docx pillow pytesseract" >&2
  exit 1
}

export HERMES_FILE_READ_PATH="$FILE"
export HERMES_FILE_READ_MAX="$MAX_CHARS"
export HERMES_FILE_READ_OCR_PAGES="$OCR_PAGES"
export HERMES_FILE_READ_NO_OCR="$NO_OCR"
export HERMES_OCR_LANGS="${HERMES_OCR_LANGS:-ara+eng}"
export HERMES_STT_PYTHON="$STT_PY"
export HERMES_STT_LANG="${HERMES_STT_LANG:-ar}"
export HERMES_STT_MODEL="${HERMES_STT_MODEL:-base}"

"$PY" - <<'PY'
import os, json, sys, shutil, subprocess, tempfile
from pathlib import Path

path = Path(os.environ["HERMES_FILE_READ_PATH"])
max_chars = int(os.environ.get("HERMES_FILE_READ_MAX", "12000"))
ocr_pages = max(0, int(os.environ.get("HERMES_FILE_READ_OCR_PAGES", "3")))
no_ocr = os.environ.get("HERMES_FILE_READ_NO_OCR", "0") == "1"
ocr_langs = os.environ.get("HERMES_OCR_LANGS", "ara+eng")
stt_py = os.environ.get("HERMES_STT_PYTHON", "")
stt_lang = os.environ.get("HERMES_STT_LANG", "ar")
stt_model = os.environ.get("HERMES_STT_MODEL", "base")
suffix = path.suffix.lower()
text = ""
engine = "none"
notes = []


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def ocr_pil_image(img) -> str:
    import pytesseract
    return (pytesseract.image_to_string(img, lang=ocr_langs) or "").strip()


def ocr_image_file(p: Path) -> str:
    from PIL import Image
    with Image.open(p) as im:
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        return ocr_pil_image(im)


def ocr_pdf_pages(p: Path, max_pages: int) -> str:
    import pymupdf
    from PIL import Image
    import io

    doc = pymupdf.open(p)
    parts = []
    limit = min(len(doc), max_pages)
    for i in range(limit):
        page = doc[i]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        parts.append(ocr_pil_image(img))
    if len(doc) > max_pages:
        notes.append(f"OCR limited to first {max_pages} pages of {len(doc)} (anti-ban/light).")
    return "\n\n".join(t for t in parts if t).strip()


def transcribe_audio(p: Path) -> str:
    """Local faster-whisper via Hermes venv; convert via ffmpeg when needed."""
    if not stt_py or not Path(stt_py).exists():
        notes.append("STT python missing (hermes-agent/venv).")
        return ""
    ffmpeg = shutil.which("ffmpeg")
    work = tempfile.mkdtemp(prefix="hermes-stt-")
    try:
        audio_in = str(p)
        if suffix not in {".wav", ".aiff", ".aif"}:
            if not ffmpeg:
                notes.append("ffmpeg missing — cannot convert WA OGG/Opus for STT.")
                return ""
            wav = str(Path(work) / "audio.wav")
            r = subprocess.run(
                [ffmpeg, "-y", "-i", audio_in, "-ac", "1", "-ar", "16000", wav],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if r.returncode != 0:
                notes.append(f"ffmpeg convert failed: {(r.stderr or '')[-200:]}")
                return ""
            audio_in = wav

        code = r'''
import json, sys
from faster_whisper import WhisperModel
path, model_name, lang = sys.argv[1], sys.argv[2], sys.argv[3]
model = WhisperModel(model_name, device="cpu", compute_type="int8")
segments, info = model.transcribe(path, language=lang or None, vad_filter=True)
text = "".join(s.text for s in segments).strip()
print(json.dumps({"ok": True, "text": text, "lang": getattr(info, "language", lang)}, ensure_ascii=False))
'''
        r = subprocess.run(
            [stt_py, "-c", code, audio_in, stt_model, stt_lang],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if r.returncode != 0:
            notes.append(f"STT failed: {(r.stderr or r.stdout or '')[-300:]}")
            return ""
        line = (r.stdout or "").strip().splitlines()[-1] if (r.stdout or "").strip() else ""
        data = json.loads(line)
        if data.get("ok") and data.get("text"):
            notes.append(f"STT local faster-whisper ({stt_model}, lang={stt_lang}).")
            return data["text"]
        notes.append("STT returned empty transcript.")
        return ""
    except Exception as e:
        notes.append(f"STT error: {e}")
        return ""
    finally:
        shutil.rmtree(work, ignore_errors=True)


try:
    if suffix in {".txt", ".md", ".csv", ".json", ".log", ".html", ".htm", ".xml", ".tsv"}:
        engine = "text"
        text = path.read_text(encoding="utf-8", errors="replace")
    elif suffix == ".pdf":
        try:
            import pymupdf
            doc = pymupdf.open(path)
            parts = []
            for page in doc:
                parts.append(page.get_text("text") or "")
            text = "\n".join(parts).strip()
            engine = "pymupdf"
            if not text:
                notes.append("PDF has no text layer (likely scanned).")
                if not no_ocr and ocr_pages > 0 and tesseract_available():
                    try:
                        text = ocr_pdf_pages(path, ocr_pages)
                        engine = "tesseract-pdf"
                        if text:
                            notes.append(f"OCR via tesseract ({ocr_langs}).")
                        else:
                            notes.append("OCR ran but returned empty text.")
                    except Exception as oe:
                        notes.append(f"OCR failed: {oe}")
                elif no_ocr:
                    notes.append("OCR skipped (--no-ocr).")
                else:
                    notes.append(
                        "Free OCR unavailable (install tesseract + pillow/pytesseract in docs-venv), "
                        "or use Hermes vision on a page image."
                    )
        except Exception as e:
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(path))
                text = "\n".join((p.extract_text() or "") for p in reader.pages).strip()
                engine = "pypdf"
                if not text:
                    notes.append(f"pymupdf failed ({e}); pypdf also empty.")
                    if not no_ocr and ocr_pages > 0 and tesseract_available():
                        try:
                            text = ocr_pdf_pages(path, ocr_pages)
                            engine = "tesseract-pdf"
                            if text:
                                notes.append(f"OCR via tesseract ({ocr_langs}).")
                        except Exception as oe:
                            notes.append(f"OCR failed: {oe}")
            except Exception as e2:
                print(json.dumps({"ok": False, "error": f"pdf read failed: {e}; {e2}"}, ensure_ascii=False))
                sys.exit(1)
    elif suffix in {".docx"}:
        import docx
        d = docx.Document(str(path))
        text = "\n".join(p.text for p in d.paragraphs if p.text).strip()
        engine = "python-docx"
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"}:
        if not no_ocr and tesseract_available():
            try:
                text = ocr_image_file(path)
                engine = "tesseract-image"
                if text:
                    notes.append(f"OCR via tesseract ({ocr_langs}).")
                else:
                    notes.append("OCR ran but returned empty text — try Hermes vision_analyze.")
            except Exception as oe:
                engine = "image"
                notes.append(f"OCR failed ({oe}); fall back to vision_analyze if available.")
        else:
            engine = "image"
            notes.append(
                "Image — OCR skipped or tesseract missing. Use Hermes vision_analyze on the local path."
            )
    elif suffix in {".heic"}:
        engine = "image"
        notes.append(
            "HEIC — convert to PNG/JPEG first, or use Hermes vision_analyze. "
            "tesseract path expects common raster formats."
        )
    elif suffix in {".ogg", ".opus", ".mp3", ".m4a", ".wav", ".aac", ".oga", ".flac", ".webm"}:
        engine = "stt-local"
        text = transcribe_audio(path)
        if not text:
            engine = "audio"
            notes.append(
                "Voice/audio — STT empty/failed; Hermes gateway STT may still work for VOICE notes. "
                "Do not invent transcript."
            )
    else:
        raw = path.read_bytes()[: max_chars * 2]
        try:
            text = raw.decode("utf-8")
            engine = "utf8-sniff"
        except UnicodeDecodeError:
            notes.append(f"Unsupported type {suffix or '(none)'} for text extract.")
            engine = "unsupported"

    truncated = False
    if len(text) > max_chars:
        text = text[:max_chars]
        truncated = True
        notes.append(f"truncated to {max_chars} chars")

    out = {
        "ok": True,
        "path": str(path),
        "name": path.name,
        "suffix": suffix,
        "engine": engine,
        "chars": len(text),
        "truncated": truncated,
        "notes": notes,
        "text": text,
    }
    print(json.dumps(out, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e), "path": str(path)}, ensure_ascii=False))
    sys.exit(1)
PY
