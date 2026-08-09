# Mac always-on + Hermes messaging gateway

Arabic + English checklist for keeping this Intel Mac (Monterey) awake and running Hermes messaging (`hermes gateway`) without breaking ArabicBuzz Telegram.

---

## A) Prevent sleep / منع النوم

### Automated on this Mac ✅

| Item | Status |
|------|--------|
| LaunchAgent `com.arabicbuzz.nosleep` → `caffeinate -dims` | Installed & running |
| AC `pmset` `sleep 0` / `displaysleep 0` | Already set |
| Gateway `ai.hermes.gateway` (launchd) | Installed & supervised |

Reinstall / unload:

```bash
npm run mac-nosleep:install
# = ./scripts/install-mac-nosleep-launchd.sh

./scripts/install-mac-nosleep-launchd.sh --unload
# Optional (sudo password): harden AC profile
./scripts/install-mac-nosleep-launchd.sh --pmset
```

Verify:

```bash
pgrep -lf 'caffeinate -dims'
pmset -g assertions | grep -i caffeinate
```

### Warnings / تحذيرات

| EN | AR |
|----|-----|
| **Lid closed on battery** → Mac still sleeps. Keep on **AC**, lid open, or clamshell + external display + power. | **إغلاق الغطاء على البطارية** ينيم الجهاز. ابقَ على الشاحن، الغطاء مفتوحاً، أو وضع الكلامسيل مع شاشة خارجية. |
| Logout / Fast User Switching stops LaunchAgents for your GUI session. Stay logged in. | تسجيل الخروج يوقف وكلاء launchd لجلسة المستخدم. ابقَ مسجّلاً. |
| Display never sleeping (`-d`) uses more power / panel wear — intentional for a “server Mac”. | منع نوم الشاشة يستهلك طاقة أكثر — مقصود لماك يعمل كخادم. |
| True 24/7 remote Bot API without this Mac: see [telegram-always-on-bot-api.md](./telegram-always-on-bot-api.md) (Fly). | لبوت تيليجرام 24/7 بدون الماك: انظر مسار Fly في المستند أعلاه. |

Related: [deploy/mac-hop/README.md](../deploy/mac-hop/README.md) (OrbStack hops / cloudflared).

---

## B) Hermes messaging gateway / بوابة الرسائل

Official docs: [Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) · [Telegram](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram) · [WhatsApp](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp)

### Automated on this Mac ✅

| Item | Status |
|------|--------|
| `hermes` CLI (`~/.local/bin/hermes`) | Present |
| `hermes gateway install` → `~/Library/LaunchAgents/ai.hermes.gateway.plist` | Installed, KeepAlive |
| `TELEGRAM_ALLOWED_USERS` in `~/.hermes/.env` (owner chat id) | Set |
| Hermes-only `TELEGRAM_BOT_TOKEN` in `~/.hermes/.env` (`@waqfBbot`) | Set — **not** ArabicBuzz `@alhuda14bot` |
| Gateway Telegram adapter | Connected (long polling) |

Commands:

```bash
export PATH="$HOME/.local/bin:$PATH"
hermes gateway status
tail -f ~/.hermes/logs/gateway.log
hermes gateway restart   # after editing ~/.hermes/.env
```

### `hermes serve` vs gateway

| Process | Role | On this Mac |
|---------|------|-------------|
| `hermes serve` | Desktop / JSON-RPC backend (port 9119) | Prefer **Hermes.app**. Optional LaunchAgent below only fills the gap when Desktop is quit. |
| `hermes gateway` | Telegram / WhatsApp messaging | launchd `ai.hermes.gateway` ✅ |

Optional LaunchAgent (idles while Desktop already runs serve — no port fight):

```bash
./scripts/install-hermes-serve-launchd.sh
# Unload: ./scripts/install-hermes-serve-launchd.sh --unload
```

Manual:

```bash
hermes serve --host 127.0.0.1 --port 9119 --skip-build
```

### Free MCP / skills on this Mac (Track C)

Configured in `~/.hermes/config.yaml` under `mcp_servers` (local only — never commit secrets):

| Server | Package | Key? |
|--------|---------|------|
| filesystem | `@modelcontextprotocol/server-filesystem` | no |
| memory | `@modelcontextprotocol/server-memory` | no |
| sequential-thinking | `@modelcontextprotocol/server-sequential-thinking` | no |
| duckduckgo | `@ericthered926/duckduckgo-mcp-server` | no |
| context7 | `@upstash/context7-mcp` | no |
| time | `@guanxiong/mcp-server-time` (npx) | **enabled** — official `@modelcontextprotocol/server-time` is npm 404 |
| git / markitdown | official / markitdown-mcp | **keep disabled** — packages 404 / fragile on Monterey; GitHub MCP covers git ops |
| github | `@modelcontextprotocol/server-github` | optional `GITHUB_PERSONAL_ACCESS_TOKEN` in `~/.hermes/.env` |

Skill: `~/.hermes/skills/research/duckduckgo-search` — free web fallback when Firecrawl key is absent.

```bash
export PATH="$HOME/.hermes/bin:$HOME/.local/bin:$PATH"
hermes mcp list
hermes skills list | grep -i duck
```

Note: prefer **npx** MCP servers on Monterey; `uvx` Python MCP wrappers need the `~/.hermes/bin/realpath` shim.

---

## C) Telegram — separate bot required / تيليجرام — بوت منفصل

### أي بوت لأي شيء؟

| البوت | الدور |
|--------|--------|
| **`@waqfBbot`** | هيرميس (Hermes) على الماك — مساعد شخصي عبر تيليجرام + واتساب. **ليس** بوت جمعية ArabicBuzz. |
| **`@alhuda14bot`** | بوت ArabicBuzz «عمل الجمعية» على الموقع (CranL) + وكلاء الغرفة وكيل١–٨. |

### Why not reuse ArabicBuzz token?

ArabicBuzz `@alhuda14bot` uses a **webhook** on CranL (`TELEGRAM_BOT_TOKEN` in `.env.local`). Hermes gateway uses **long polling** by default. **One bot token cannot reliably serve both** (webhook + polling fight; messages get stolen).

| Do | Don’t |
|----|-------|
| Create a **new** bot with [@BotFather](https://t.me/BotFather) for Hermes only | Paste ArabicBuzz `TELEGRAM_BOT_TOKEN` into `~/.hermes/.env` |
| Put the new token only in `~/.hermes/.env` | Point Hermes at the CranL webhook bot |

### Telegram on this Mac (done)

- Token lives only in `~/.hermes/.env` (mode `600`) — never in ArabicBuzz `.env.local` / CranL.
- Bot: **`@waqfBbot`** — DM it from the account matching `TELEGRAM_ALLOWED_USERS`.
- After token changes: `hermes gateway restart`

If you need a **replacement** bot later:

1. `@BotFather` → `/newbot` (or `/revoke` on the old one) → new token.
2. Set `TELEGRAM_BOT_TOKEN=...` in `~/.hermes/.env` only.
3. `hermes gateway restart`

Optional wizard: `hermes gateway setup` (interactive).

---

## D) WhatsApp — official Hermes = Baileys (unofficial WA) / واتساب

Hermes **officially** supports WhatsApp via a **Baileys** bridge (emulates WhatsApp Web). There is also **WhatsApp Cloud API** (`hermes whatsapp-cloud`) for Meta Business.

### Risks (honest)

| EN | AR |
|----|-----|
| Not Meta’s consumer Bot API — **ban / restriction risk** on personal accounts. | ليس واجهة بوت رسمية للمستهلك — **خطر حظر** للحساب الشخصي. |
| Prefer a **dedicated phone number**, not your main WA. | فضّل **رقماً مخصصاً** للبوت، لا رقمك الشخصي. |
| Protocol changes can break the bridge until Hermes updates. | تحديثات واتساب قد تكسر الجسر حتى يحدّث Hermes. |
| Session under `~/.hermes/platforms/whatsapp/session` = full account access — never commit. | مجلد الجلسة = وصول كامل للحساب — لا ترفعه للمستودع. |

### You still must do (WhatsApp QR)

Not automated (needs your phone camera):

```bash
export PATH="$HOME/.local/bin:$PATH"
hermes whatsapp          # shows QR — scan in WhatsApp → Linked Devices
```

Then in `~/.hermes/.env` uncomment / set:

```bash
WHATSAPP_ENABLED=true
WHATSAPP_MODE=bot          # required for group @mentions from other people
WHATSAPP_ALLOWED_USERS=966550514658
WHATSAPP_DM_POLICY=pairing
WHATSAPP_GROUP_POLICY=allowlist
WHATSAPP_GROUP_ALLOWED_USERS=120363303131762131@g.us   # add more @g.us JIDs comma-separated
WHATSAPP_REQUIRE_MENTION=true
WHATSAPP_MENTION_PATTERNS=["(?i)\\bhermes\\b","(?i)هيرميس","(?i)هيرمز"]
```

```bash
hermes gateway restart
```

### Honest limit — not a Telegram-style bot / حد صادق

Baileys links a **personal WhatsApp account**. Hermes replies **as that phone number** in the group (same bubble as a human member). There is **no** Meta bot badge / Bot API identity. Closest behavior: reply when someone **@mentions the number**, replies to Hermes, uses `/command`, or writes wake words (`Hermes` / `هيرميس`).

| Mode | What it does |
|------|----------------|
| `self-chat` | Only your messages to yourself. **Drops** other people’s DMs and **all group pings**. |
| `bot` | Processes messages from others (DMs + groups). Needed for group mention replies. |

### Groups — add number + how to ping / المجموعات

1. **Join the group with the linked number** (`+966 55 051 4658`):
   - Prefer invite link → script (Baileys `groupAcceptInvite`):
     ```bash
     node scripts/hermes-wa-join-invite.mjs 'https://chat.whatsapp.com/CODE'
     # or: node scripts/hermes-wa-join-invite.mjs CODE
     ```
     If WhatsApp returns **409 conflict**, the number is **already a member** — the script resolves the `@g.us` JID from invite info.
   - Or open the invite on the phone linked as Hermes and join there.
2. **Allowlist the group JID** (required when `WHATSAPP_GROUP_POLICY=allowlist`):
   ```bash
   ./scripts/hermes-wa-allowlist-sync.sh --add '120363…@g.us'
   # or scrape logs / scan participating groups:
   ./scripts/hermes-wa-allowlist-sync.sh --from-logs
   ./scripts/hermes-wa-allowlist-sync.sh   # full participating scan (brief gateway stop)
   ```
3. **Members ping Hermes** by any of:
   - WhatsApp **@mention** of that contact (type `@` → choose the number / name)
   - Writing **`Hermes`** or **`هيرميس`** / **`هيرمز`** (wake-word patterns)
   - **Reply** to a previous Hermes message in the group
   - A slash command like `/status` or Arabic **`مساعدة`** / `/help`
4. Hermes answers **in the same group**, as the linked account (not a separate bot user).

**Known group (عمل الوقف):** `120363429457422075@g.us` (joined + allowlisted).

### Auto-allowlist + disconnect watchdog

```bash
./scripts/install-hermes-wa-watchdog-launchd.sh
# Unload: ./scripts/install-hermes-wa-watchdog-launchd.sh --unload
```

LaunchAgent `com.arabicbuzz.hermes-wa-watchdog` every ~2 min:
- scrapes bridge/gateway logs for new `@g.us` and merges into allowlist
- restarts gateway if WA `/health` stays disconnected
- optional Telegram alert via `hermes send --to telegram`

### Backup WhatsApp session (local only — never git)

```bash
./scripts/hermes-backup-wa-session.sh
# → ~/Backups/hermes-wa/YYYYMMDD-HHMMSS/ + .tgz (mode 600)
```

### Arabic commands (@waqfBbot + WA)

| User types | Effect |
|------------|--------|
| `/help` · `مساعدة` · `/مساعدة` | Short Arabic command list (`~/.hermes/SOUL.md` + skill `ar-help`) |
| `/status` · `حالة` | Session/status |
| `/new` · `جديد` | New chat |
| Telegram `/` menu | Prioritizes help/status/new/stop/whoami via `platforms.telegram.extra.command_menu` |

Do **not** point Hermes at ArabicBuzz `@alhuda14bot`. Do **not** enable Discord here unless explicitly requested.

### Allowlist so OTHER people can trigger / قائمة السماح للآخرين

| Setting | Role |
|---------|------|
| `WHATSAPP_MODE=bot` | Without this, group mentions from others never reach Hermes. |
| `WHATSAPP_GROUP_POLICY=allowlist` | Only listed group JIDs (`…@g.us`). Default `pairing` **blocks all groups**. (`open` needs `WHATSAPP_ALLOW_ALL_USERS=true` or Hermes refuses to start.) |
| `WHATSAPP_GROUP_ALLOWED_USERS` / `whatsapp.group_allow_from` | Comma-separated / YAML list of group JIDs. Seeded with `120363303131762131@g.us` from bridge logs — add others after joining new groups (`WHATSAPP_DEBUG=true` to discover). |
| `WHATSAPP_REQUIRE_MENTION=true` | Do not reply to ordinary group chatter — only mention / wake-word / reply-to-bot / `/cmd`. |
| `WHATSAPP_DM_POLICY=pairing` | Bridge must not apply the DM phone allowlist to group senders (allowlist at bridge would block non-owner members). |
| `WHATSAPP_ALLOWED_USERS=9665…` | Owner phone for DM context; **group** triggers are gated by group policy + mention, not by listing every member. |
| `whatsapp.unauthorized_dm_behavior: ignore` in `config.yaml` | Strangers DMing the number stay silent (no pairing spam). |

**Trade-off:** leaving `self-chat` breaks “message yourself”; use a normal DM to the linked number from another phone, or keep notes separate.

### WhatsApp allowlist how-to / قائمة السماح (DMs)

Hermes DM access uses `WHATSAPP_ALLOWED_USERS` / pairing (gateway env — **not** ArabicBuzz CranL vars).

| Value | Meaning |
|-------|---------|
| `*` | Allow anyone who can message the linked WA account (dev only — avoid on a personal number) |
| `9665xxxxxxxx` | One Saudi mobile in **international digits**, no `+`, no spaces |
| `9665…,1555…` | Comma-separated list of several numbers |

**Steps**

1. Link the device first (`hermes whatsapp` → scan QR).
2. Edit `~/.hermes/.env` only (mode `600`). Set `WHATSAPP_ENABLED=true` and `WHATSAPP_MODE=bot` for groups / multi-user.
3. Set group/mention vars as above; keep owner in `WHATSAPP_ALLOWED_USERS`.
4. `hermes gateway restart` then @mention the number in a WA group.
5. Confirm in `~/.hermes/logs/gateway.log` / `platforms/whatsapp/bridge.log` (ignored vs handled).

**Do not**

- Put WhatsApp session folders or tokens in git.
- Reuse ArabicBuzz CranL `WHATSAPP_TOKEN` / bridge secrets as Hermes Baileys config (separate stacks).
- Touch `TELEGRAM_BOT_TOKEN` for `@waqfBbot` while configuring WA.

Safer business path: [WhatsApp Cloud API](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) via `hermes whatsapp-cloud` (Meta Business + public webhook) — separate from Baileys.

ArabicBuzz already has Cloud API vars in `.env.local` (`WHATSAPP_TOKEN`, …) for the **CranL app** — do not assume they are wired into Hermes; configure Hermes Cloud separately if you choose that path.

---

## E) Discord / other platforms

**Out of scope for ArabicBuzz Mac ops unless explicitly requested.** Do not enable Discord/Slack from these scripts.

```bash
# Interactive only if you truly need it:
# hermes gateway setup
```

Tokens would go in `~/.hermes/.env` only — never into the ArabicBuzz repo.

---

## F) Quick status checklist / قائمة تحقق سريعة

```bash
# Sleep
launchctl print "gui/$(id -u)/com.arabicbuzz.nosleep" 2>/dev/null | head -5
pgrep -lf 'caffeinate -dims'

# Hermes gateway
export PATH="$HOME/.local/bin:$PATH"
hermes gateway status
tail -20 ~/.hermes/logs/gateway.log

# Hermes serve (Desktop preferred; LaunchAgent idles if Desktop owns serve)
./scripts/install-hermes-serve-launchd.sh
hermes serve --status

# WA allowlist + disconnect watchdog
./scripts/install-hermes-wa-watchdog-launchd.sh
curl -sf http://127.0.0.1:3000/health

# Mac hop (ArabicBuzz tunnels) — separate
npm run mac-hop:install
```

---

## Summary: automated vs your steps

| Automated here | You still do |
|----------------|--------------|
| `caffeinate -dims` LaunchAgent | Keep Mac on AC; avoid lid+battery sleep |
| `hermes gateway` launchd + Hermes-only Telegram (`@waqfBbot`) | Scan WhatsApp QR (`hermes whatsapp`) if you accept Baileys risk |
| WA group join/allowlist scripts + `hermes-wa-watchdog` | Share invite links / confirm @mention in group |
| Session backup → `~/Backups/hermes-wa/` | Offsite copy of `.tgz` if desired (never git) |
| Optional `hermes-serve` LaunchAgent (Desktop-safe) | Leave Hermes.app open when using Desktop UI |
| `TELEGRAM_ALLOWED_USERS` | — |
| Docs + install scripts in repo | **Not** Discord/Slack unless asked |
| **Did not** touch ArabicBuzz webhook bot | — |

Refs: [Hermes messaging overview](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) · [deploy/mac-hop](../deploy/mac-hop/README.md)
