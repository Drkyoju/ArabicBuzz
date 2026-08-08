# PaddleOCR sidecar (optional)

PaddleOCR is an optional self-hosted step after Gemini fails the convert quality gate. Models are heavy — do **not** bake them into the thin CranL app image.

## Wire-up

1. Build/run this sidecar (or any host with `scripts/paddle-ocr-bridge.py`).
2. Set on CranL: `PADDLE_OCR_URL=https://…` (optional `PADDLE_OCR_SECRET`).
3. Convert cascade uses it after Gemini Flash → stronger Gemini, then **STOP** (no auto-Mistral).

## Cascade (live)

1. Gemini Flash  
2. Stronger Gemini if weak  
3. PaddleOCR (when URL / `ENABLE_PADDLE_OCR=1`)  
4. **STOP** — refuse with Arabic honesty (never ship mojibake)  
5. Mistral only if `CONVERT_ALLOW_MISTRAL=1` **and** `MISTRAL_API_KEY` (default OFF)

When Gemini + Paddle both fail, tell the user in MSA that no file was created, and they may later enable Mistral or stop converting that file.
