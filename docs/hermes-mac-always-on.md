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
| `hermes serve` | Desktop / JSON-RPC backend (port 9119) | Already running via **Hermes.app** — do not start a second copy on the same port |
| `hermes gateway` | Telegram / WhatsApp / Discord / … messaging | launchd `ai.hermes.gateway` ✅ |

If you quit Hermes Desktop and still want the API server:

```bash
hermes serve --host 127.0.0.1 --port 9119 --skip-build
```

Prefer leaving **Hermes.app** open, or use Desktop’s own restart — avoid fighting two supervisors on `:9119`.

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
WHATSAPP_MODE=bot          # or self-chat
WHATSAPP_ALLOWED_USERS=*   # or your number e.g. 9665xxxxxxxx
```

```bash
hermes gateway restart
```

### WhatsApp allowlist how-to / قائمة السماح

Hermes only answers WhatsApp senders listed in `WHATSAPP_ALLOWED_USERS` (gateway env — **not** ArabicBuzz CranL vars).

| Value | Meaning |
|-------|---------|
| `*` | Allow anyone who can message the linked WA account (dev only — avoid on a personal number) |
| `9665xxxxxxxx` | One Saudi mobile in **international digits**, no `+`, no spaces |
| `9665…,1555…` | Comma-separated list of several numbers |

**Steps**

1. Link the device first (`hermes whatsapp` → scan QR).
2. Edit `~/.hermes/.env` only (mode `600`). Set `WHATSAPP_ENABLED=true` and `WHATSAPP_MODE=bot` (or `self-chat` for your own chats).
3. Set `WHATSAPP_ALLOWED_USERS` to your number(s) — prefer explicit IDs over `*` on a personal phone.
4. `hermes gateway restart` then DM the linked WhatsApp from an allowlisted number.
5. Confirm in `~/.hermes/logs/gateway.log` (ignored / unauthorized vs handled).

**Do not**

- Put WhatsApp session folders or tokens in git.
- Reuse ArabicBuzz CranL `WHATSAPP_TOKEN` / bridge secrets as Hermes Baileys config (separate stacks).
- Touch `TELEGRAM_BOT_TOKEN` for `@alhuda14bot` while configuring WA.

Safer business path: [WhatsApp Cloud API](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) via `hermes whatsapp-cloud` (Meta Business + public webhook) — separate from Baileys.

ArabicBuzz already has Cloud API vars in `.env.local` (`WHATSAPP_TOKEN`, …) for the **CranL app** — do not assume they are wired into Hermes; configure Hermes Cloud separately if you choose that path.

---

## E) Discord / other platforms

```bash
hermes gateway setup
```

Pick Discord (bot token + intents), Slack, Signal, etc. Tokens go in `~/.hermes/.env` only — never into the ArabicBuzz repo.

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

# Hermes serve (Desktop)
hermes serve --status
pgrep -lf 'hermes serve'

# Mac hop (ArabicBuzz tunnels) — separate
npm run mac-hop:install
```

---

## Summary: automated vs your steps

| Automated here | You still do |
|----------------|--------------|
| `caffeinate -dims` LaunchAgent | Keep Mac on AC; avoid lid+battery sleep |
| `hermes gateway` launchd + Hermes-only Telegram (`@waqfBbot`) | Scan WhatsApp QR (`hermes whatsapp`) if you accept Baileys risk |
| `TELEGRAM_ALLOWED_USERS` | Discord/Slack / Meta Cloud if needed |
| Docs + install scripts in repo | Discord/Slack tokens, passwords, Meta Cloud verification |
| **Did not** touch ArabicBuzz webhook bot | Leave Hermes.app open for `hermes serve` (or run serve manually) |

Refs: [Hermes messaging overview](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) · [deploy/mac-hop](../deploy/mac-hop/README.md)
