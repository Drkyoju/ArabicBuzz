# telegram-bot-api sidecar (optional — large file downloads)

Raises Bot API `getFile` beyond the ~20MB cloud limit. **Do not bake into the CranL app image.**

## Mac + OrbStack (not 24/7)

OrbStack runs on the Mac — **the machine must stay awake**. Sleep / power-off / OrbStack down = this hop is down. Jobs queue silently and resume from room/Drive or when the hop returns.

See [docs/telegram-always-on-bot-api.md](../../docs/telegram-always-on-bot-api.md).

## Always-on VPS / second machine (permanent path)

Same compose on any host that does not sleep:

```bash
# From https://my.telegram.org
export TELEGRAM_API_ID=12345
export TELEGRAM_API_HASH=abcdef…

cd deploy/telegram-bot-api
docker compose up -d
# listens on 127.0.0.1:8081
```

Expose HTTPS to 8081 (Cloudflare Tunnel, Caddy, nginx, Tailscale Funnel, …), then on CranL:

| Env | Example |
|-----|---------|
| `TELEGRAM_BOT_API_URL` | `https://botapi.example.com` |
| `MAC_SYNC_URL` | optional — Mac OCR / MTProto when Mac is on |
| `MAC_SYNC_SECRET` | if using Mac hop |

No paid VPS credentials are stored in this repo — use any always-on host you control.

## Mac-only wiring (laptop awake)

- Leave Bot API on `127.0.0.1:8081`
- `npm run storage:sync` + tunnel → `MAC_SYNC_URL` so CranL calls `/telegram/fetch-file`
- Or tunnel 8081 and set `TELEGRAM_BOT_API_URL` directly

## Image

Uses the official multi-arch build when available; pin/tag as needed for your host.

## One-command

```bash
npm run telegram:bot-api-setup
```

Mac OrbStack pin (1.5.1): `npm run orbstack:pin`  
Mac hop restart + tunnel tips: `npm run storage:sync:up`

Env template: [`.env.example`](./.env.example)

See also: [docs/telegram-local-bot-api.md](../../docs/telegram-local-bot-api.md)
