# Always-on Local Telegram Bot API (Fly.io / any Docker host).
# Secrets: TELEGRAM_API_ID + TELEGRAM_API_HASH via `fly secrets set` (not in this file).
FROM aiogram/telegram-bot-api:latest
COPY entrypoint.sh /entrypoint.sh
USER root
RUN chmod +x /entrypoint.sh
EXPOSE 8081
ENTRYPOINT ["/entrypoint.sh"]
