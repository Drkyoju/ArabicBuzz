# LibreOffice convert sidecar — keep out of the thin CranL app image.
# Build:  docker build -t ab-libreoffice-convert -f deploy/libreoffice-convert/Dockerfile deploy/libreoffice-convert
# Run:    docker run --rm -p 8100:8100 -e CONVERT_SECRET=change-me ab-libreoffice-convert
# CranL:  CONVERT_SERVICE_URL=https://your-host  (+ CONVERT_SECRET matching CONVERT_SECRET)

FROM debian:bookworm-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
       libreoffice-writer-nogui \
       libreoffice-calc-nogui \
       libreoffice-impress-nogui \
       fonts-noto-core fonts-noto-ui-core fonts-noto-extra \
       fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
       python3 python3-pip python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir flask==3.0.3
ENV PATH="/opt/venv/bin:$PATH"

COPY server.py /app/server.py

ENV CONVERT_PORT=8100
ENV HOME=/tmp
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health')" || exit 1

CMD ["python3", "/app/server.py"]
