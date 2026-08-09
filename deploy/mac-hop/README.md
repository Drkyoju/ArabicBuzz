# Mac hop durability (laptop awake — not true 24/7)

**OrbStack MUST stay on 1.5.1** on this Mac (`./scripts/pin-orbstack-1.5.1.sh` — never upgrade). The hop watchdog re-pins on each pass and opens OrbStack if Docker died after sleep.

While the Mac is awake and you are logged in, launchd keeps:

1. Hop watchdog (`com.arabicbuzz.hop-watchdog`) — Local Bot API `:8081` + `storage:sync` `:7420` + cloudflared tunnels + CranL env PUT when trycloudflare URLs change; adaptive loop (~90s healthy / ~25s after wake failure)
2. Nosleep (`com.arabicbuzz.nosleep` → `caffeinate -dims`) — installed with `mac-hop:install` by default
3. Optional Hermes WA watchdog — [deploy/hermes/README.md](../hermes/README.md) (separate; do not break WA)

Cloudflared quick-tunnel logs default to `~/Library/Logs/ArabicBuzz/ab-cloudflared-*.log` (symlinked from `/tmp` for older greps). When `MAC_SYNC_URL` changes, the watchdog updates CranL **and** rewrites `MAC_SYNC_URL` / `NEXT_PUBLIC_MAC_UPLOAD_URL` in local `.env.local`.

Optional separate agent plist: `com.arabicbuzz.mac-sync.plist` (usually unused — watchdog already starts the agent to avoid port conflicts).

## Install (once)

```bash
npm run mac-hop:install
# = ./scripts/install-mac-hop-launchd.sh
# installs hop-watchdog + nosleep (skip nosleep: --no-nosleep)

npm run mac-nosleep:install
# = ./scripts/install-mac-nosleep-launchd.sh  (if installed separately)
```

Unload:

```bash
./scripts/install-mac-hop-launchd.sh --unload
# also unloads nosleep unless --no-nosleep
```

## Manual one-shot

```bash
npm run mac-hop:watchdog          # ensure hops + PUT if URL changed
npm run mac-hop:watchdog:force    # force CranL PUT + restart
```

## Logs

- `~/Library/Logs/ArabicBuzz/mac-sync.*.log`
- `~/Library/Logs/ArabicBuzz/hop-watchdog.*.log`
- `~/Library/Logs/ArabicBuzz/nosleep.*.log`
- `/tmp/ab-cloudflared-mac-sync.log` → symlink into Logs
- `/tmp/ab-cloudflared-botapi.log` → symlink into Logs

## Sleep limits / حدود النوم (مهم)

الـ hop **ليس 24/7**. السكربتات تُبقي الخدمات طالما الماك **مستيقظ ومسجّل دخول**:

| ما يساعد | ما لا يزال يقتل الـ hop |
|----------|-------------------------|
| `caffeinate -dims` عبر launchd | إغلاق الغطاء على البطارية |
| شاحن AC متصل دائماً | تسجيل الخروج / تبديل مستخدم |
| غطاء مفتوح، أو clamshell + شاحن + شاشة خارجية | نوم قسري من القائمة / بطارية منخفضة |
| إعداد macOS: Battery → Options → Prevent automatic sleeping when the display is off (على المحول) | ترقية OrbStack فوق 1.5.1 (ممنوع على هذا الماك) |
| watchdog يعيد الأنفاق بعد الاستيقاظ (~25ث عند العطل) | انقطاع الشبكة الطويل بدون إعادة نفق |

**نصيحة بشرية:** وصّل الشاحن، امنع النوم التلقائي على المحول، لا تعتمد على البطارية + غطاء مغلق. لـ Bot API دائم بدون الماك: `npm run telegram:bot-api:fly` بعد `fly auth login`.

See [docs/telegram-always-on-bot-api.md](../../docs/telegram-always-on-bot-api.md) · [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md).
