# telegram-bot-api sidecar (optional — large file downloads)

Raises Bot API `getFile` beyond the ~20MB cloud limit. **Do not bake into the CranL app image.**

## Run on Mac / VPS

```bash
# From https://my.telegram.org
export TELEGRAM_API_ID=12345
export TELEGRAM_API_HASH=abcdef…
export TELEGRAM_BOT_TOKEN=123456:ABC…   # same token as CranL

docker compose up -d
# listens on 127.0.0.1:8081
```

Wire CranL:

- `TELEGRAM_BOT_API_URL=https://<tunnel-to-8081>`  
  **or** leave local-only and set `MAC_SYNC_URL` so CranL calls Mac `/telegram/fetch-file`.

## Image

Uses the official multi-arch build when available; pin/tag as needed for your host.

See also: [docs/telegram-local-bot-api.md](../../docs/telegram-local-bot-api.md)
