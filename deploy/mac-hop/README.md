# Mac hop durability (laptop awake — not true 24/7)

While the Mac is awake and you are logged in, launchd keeps:

1. Hop watchdog (`com.arabicbuzz.hop-watchdog`) — Local Bot API + `storage:sync` + cloudflared tunnels + CranL env PUT when trycloudflare URLs change
2. Optional nosleep (`com.arabicbuzz.nosleep` → `caffeinate -dims`) — [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md)

Optional separate agent plist: `com.arabicbuzz.mac-sync.plist` (usually unused — watchdog already starts the agent to avoid port conflicts).

## Install (once)

```bash
npm run mac-hop:install
# = ./scripts/install-mac-hop-launchd.sh

npm run mac-nosleep:install
# = ./scripts/install-mac-nosleep-launchd.sh
```

Unload:

```bash
./scripts/install-mac-hop-launchd.sh --unload
./scripts/install-mac-nosleep-launchd.sh --unload
```

## Manual one-shot

```bash
npm run mac-hop:watchdog          # ensure hops + PUT if URL changed
npm run mac-hop:watchdog:force    # force CranL PUT + restart
```

## Logs

- `~/Library/Logs/ArabicBuzz/mac-sync.*.log`
- `~/Library/Logs/ArabicBuzz/hop-watchdog.*.log`
- `/tmp/ab-cloudflared-mac-sync.log`
- `/tmp/ab-cloudflared-botapi.log`

## Limits

- **Mac sleep / lid close / logout** still kills trycloudflare + OrbStack.
- For permanent `TELEGRAM_BOT_API_URL` without the Mac: `npm run telegram:bot-api:fly` after `fly auth login` (see `deploy/telegram-bot-api/`).

See [docs/telegram-always-on-bot-api.md](../../docs/telegram-always-on-bot-api.md).
