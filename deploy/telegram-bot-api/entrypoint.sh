#!/bin/sh
# Fly / Docker entrypoint for Local Telegram Bot API.
# Secrets come from env (fly secrets set) — never bake into the image.
set -eu
if [ -z "${TELEGRAM_API_ID:-}" ] || [ -z "${TELEGRAM_API_HASH:-}" ]; then
  echo "TELEGRAM_API_ID and TELEGRAM_API_HASH are required" >&2
  exit 1
fi
# Railway/Fly/Docker: prefer PORT when the host injects it (default 8081).
HTTP_PORT="${PORT:-${HTTP_PORT:-8081}}"
exec telegram-bot-api \
  --api-id="${TELEGRAM_API_ID}" \
  --api-hash="${TELEGRAM_API_HASH}" \
  --local \
  --http-port="${HTTP_PORT}" \
  --dir=/var/lib/telegram-bot-api \
  "$@"
