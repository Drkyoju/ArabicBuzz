# PaddleOCR sidecar (optional)

PaddleOCR is **cheaper than Mistral** when self-hosted, but the models are heavy — do **not** bake them into the thin CranL app image.

## Wire-up

1. Build/run this sidecar (or any host with `scripts/paddle-ocr-bridge.py`).
2. Set on CranL: `PADDLE_OCR_URL=https://…` (optional `PADDLE_OCR_SECRET`).
3. Convert cascade uses it after Gemini Flash → stronger Gemini, **before** Mistral.

## Cascade (live)

1. Gemini Flash  
2. Stronger Gemini if weak  
3. PaddleOCR (when URL / `ENABLE_PADDLE_OCR=1`)  
4. Mistral only if `MISTRAL_API_KEY` and still needed  
5. Refuse with Arabic honesty — never ship mojibake  

Quality of Paddle is **not always stronger** than Mistral; it is preferred for cost when available.
