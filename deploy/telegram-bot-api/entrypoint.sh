#!/bin/sh
# Fly / Docker entrypoint for Local Telegram Bot API.
# Secrets come from env (fly secrets set) — never bake into the image.
set -eu
if [ -z "${TELEGRAM_API_ID:-}" ] || [ -z "${TELEGRAM_API_HASH:-}" ]; then
  echo "TELEGRAM_API_ID and TELEGRAM_API_HASH are required" >&2
  exit 1
fi
exec telegram-bot-api \
  --api-id="${TELEGRAM_API_ID}" \
  --api-hash="${TELEGRAM_API_HASH}" \
  --local \
  --http-port=8081 \
  --dir=/var/lib/telegram-bot-api \
  "$@"
