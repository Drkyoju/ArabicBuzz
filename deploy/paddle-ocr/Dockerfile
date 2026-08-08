# Optional PaddleOCR sidecar — keep out of the thin CranL app image.
# PaddleOCR + paddlepaddle is multi-GB; wire via PADDLE_OCR_URL instead.
#
# Build:  docker build -t ab-paddle-ocr -f deploy/paddle-ocr/Dockerfile .
# Run:    docker run --rm -p 7440:7440 -e PADDLE_OCR_LANG=ar ab-paddle-ocr
# CranL:  PADDLE_OCR_URL=https://your-host:7440
#
# Honesty: Paddle is cheaper than Mistral (self-hosted); quality is not always stronger.

FROM python:3.11-slim-bookworm

WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# CPU paddle; override base image for GPU hosts if needed.
RUN pip install --no-cache-dir flask pillow paddlepaddle paddleocr

COPY scripts/paddle-ocr-bridge.py /app/paddle-ocr-bridge.py
COPY scripts/paddle-ocr.py /app/paddle-ocr.py

ENV PADDLE_OCR_PORT=7440
ENV PADDLE_OCR_LANG=ar
EXPOSE 7440

CMD ["python", "/app/paddle-ocr-bridge.py"]
