# PaddleOCR sidecar (optional)

PaddleOCR Arabic is the **primary** free OCR when available (Apache-2.0). Prefer the **Mac hop** path — do **not** bake models into the thin CranL app image.

## Preferred: Mac hop

1. Install on the Mac: `scripts/paddle-ocr-venv` (see [docs/mac-ocr-tesseract.md](../../docs/mac-ocr-tesseract.md)).
2. Ensure `MAC_SYNC_URL` (+ secret) on CranL — agent exposes `POST /ocr/paddle`.
3. `GET $MAC_SYNC_URL/health` → `"paddle": true`.

## Alternate: dedicated sidecar

1. Build/run this image (or `scripts/paddle-ocr-bridge.py`).
2. Set on CranL: `PADDLE_OCR_URL=https://…` (optional `PADDLE_OCR_SECRET`).

## Cascade (live)

**قراءة عامة:** PaddleOCR → Tesseract (ماك) → Qari → Gemini

**تحويل PDF→Office:** Paddle → Tesseract → Gemini Flash → stronger Gemini → **STOP** (no auto-Mistral; opt-in `CONVERT_ALLOW_MISTRAL=1` + key) → refuse mojibake in MSA.
