# Mac always-on + Hermes messaging gateway

Arabic + English checklist for keeping this Intel Mac (Monterey) awake and running Hermes messaging (`hermes gateway`) as **WhatsApp-only** — without breaking ArabicBuzz Telegram (`@alhuda14bot` on CranL).

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
| Platforms | **WhatsApp only** — Telegram disabled |
| `TELEGRAM_BOT_TOKEN` / `@waqfBbot` | Commented out + `platforms.telegram.enabled: false` — **not** connected |
| WhatsApp (`+966550514658`, group **عمل الوقف** `120363429457422075@g.us`, mention-required) | Connected — anti-ban |

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
| `hermes gateway` | **WhatsApp only** messaging | launchd `ai.hermes.gateway` ✅ |

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
| fetch | `@tokenizin/mcp-npx-fetch` (npx) | **enabled** — official `@modelcontextprotocol/server-fetch` is npm 404; also `scripts/hermes-jina-fetch.sh` |
| wikipedia | `@shelm/wikipedia-mcp-server` (npx) | no — replaces broken `mcp-server-wikipedia` |
| math | `math-mcp` (npx) | no |
| youtube-transcript | `@sinco-lab/mcp-youtube-transcript` (npx) | no |
| git / markitdown | official / markitdown-mcp | **keep disabled** — packages 404 / fragile on Monterey |
| github | `@modelcontextprotocol/server-github` | **disabled** until `GITHUB_PERSONAL_ACCESS_TOKEN` in `~/.hermes/.env` |

Local skills: `wa-archive`, `wa-file-read`, `waqf-drive`, `ar-help`, `wa-tools`.  
Bundled free path: `duckduckgo-search`, `pdf`, `ocr-and-documents`, `google-workspace`, `domain-intel`, `arxiv`.  
Light OCR / voice: sibling path — system `tesseract` + local STT; see `scripts/hermes-file-read.sh`.  
Skipped paid/heavy: Firecrawl/Brave/Parallel (unless keyed), Google Drive HTTP MCP, Hermes catalog (Figma/Linear/Blender/…), marker-pdf (~5GB), Playwright/Chrome MCP, `youtube-transcript-mcp` (needs bun).

```bash
export PATH="$HOME/.hermes/bin:$HOME/.local/bin:$PATH"
hermes mcp list
hermes skills list | grep -E 'wa-|duck|pdf'
```

Note: prefer **npx** MCP servers on Monterey; `uvx` Python MCP wrappers need the `~/.hermes/bin/realpath` shim.

### Multi-device / حساب نووس vs قرص محلي

| What | Travels with Nous login? | Where it lives |
|------|--------------------------|----------------|
| Inference / Portal auth | **Yes** — `hermes portal login` on each machine | `auth.json` (per machine after login) |
| Official **Skill Sync** (`hermes sync push/pull`) | **Not yet for this account** — CLI exists but is **admin-gated / pre-launch** | Cloud plane when entitlement opens |
| Local skills (`wa-archive`, `wa-file-read`, `waqf-drive`, `ar-help`, `wa-tools`) | **No** — disk only until Skill Sync GA | `~/.hermes/skills/local/` |
| `SOUL.md`, `config.yaml` MCP list | **No** | `~/.hermes/` |
| Google Drive OAuth | **No** — re-auth on each machine | `google_token.json` (never git) |
| WhatsApp Baileys session | **No** — keep on always-on Mac | `~/.hermes/platforms/whatsapp/` |

**Ready on this Mac:** local skills are opted in (`hermes sync enable …`) and device label `Mac-WA-gateway` is set — when Nous opens Skill Sync for the account, run `hermes sync now`.

**Until then — portable pack (secret-free):**

```bash
./scripts/hermes-skills-sync.sh status
./scripts/hermes-skills-sync.sh pack
# → ~/.hermes/backups/skills-portable/hermes-skills-portable-….tgz (+ .sha256)
# Do NOT commit the .tgz. Copy via encrypted USB / private channel only.
```

**On PC2:**

1. Install Hermes Desktop/CLI.
2. `hermes portal login` — same Nous account (`ryodan71@gmail.com`).
3. Clone ArabicBuzz; then:
   `./scripts/hermes-skills-sync.sh restore /path/to/hermes-skills-portable-….tgz`
4. Drive: `./scripts/hermes-drive-setup.sh --from-arabicbuzz` (then `--probe`).
5. Leave WhatsApp gateway on the always-on Mac (do **not** copy Baileys session unless you intentionally move the link).

Full `hermes backup` / `hermes import` zips **include secrets** (`.env`, `auth.json`) — use only for encrypted offline disaster recovery under `~/.hermes/backups/`, never git.

---

## C) Telegram — ArabicBuzz only / تيليجرام — ArabicBuzz فقط

Hermes on this Mac is **WhatsApp-only**. Do **not** put a Hermes Telegram token in `~/.hermes/.env`.

### أي بوت لأي شيء؟

| البوت | الدور |
|--------|--------|
| **`@alhuda14bot`** | بوت ArabicBuzz «عمل الجمعية» على الموقع (CranL) + وكلاء الغرفة وكيل١–٨. **لا تلمسه من إعدادات هيرميس.** |
| **`@waqfBbot`** | كان بوت هيرميس على تيليجرام — **مفصول** عن البوابة (`TELEGRAM_BOT_TOKEN` معلّق + `platforms.telegram.enabled: false`). البوت ما زال موجوداً على BotFather حتى تحذفه يدوياً. |

### Why not reuse ArabicBuzz token?

ArabicBuzz `@alhuda14bot` uses a **webhook** on CranL (`TELEGRAM_BOT_TOKEN` in `.env.local`). Never paste that token into `~/.hermes/.env`.

### Permanent delete of `@waqfBbot` (optional)

BotFather UI only: `/deletebot` → `@waqfBbot`. Hermes no longer uses the token either way.

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
| **Safe mode reduces risk; it does not eliminate it.** Unofficial WA always has residual ban risk. | **الوضع الآمن يقلّل الخطر ولا يلغيه.** الجلسة غير الرسمية تبقى فيها نسبة حظر متبقية. |

### Anti-ban / وضع آمن (configured on this Mac)

Goal: **fewer outbound WhatsApp actions** — mention-only groups, ignore stranger DMs, slower sends, quiet UI chatter.

| Setting | Value (safe) | Why |
|---------|--------------|-----|
| `WHATSAPP_REQUIRE_MENTION` | `true` | Never reply to ordinary group chatter |
| `WHATSAPP_GROUP_POLICY` | `allowlist` | Only listed `@g.us` groups |
| `whatsapp.unauthorized_dm_behavior` | `ignore` | Strangers get silence (no pairing spam) |
| `WHATSAPP_CHUNK_DELAY_MS` | `1800` | Pause between long-message chunks (default 300) |
| `text_batch_delay_seconds` | `10` / split `18` | Debounce inbound bursts → fewer reply storms |
| `send_read_receipts` | `false` | Less “always-online bot” signaling |
| `display.tool_progress` | `off` | No tool-status spam into the chat |
| `TELEGRAM_ENABLED` | `false` | WhatsApp only |

`WHATSAPP_MODE=bot` stays on so **عمل الوقف** can @mention the number. Absolute quietest mode is `self-chat` (owner-only; **drops all group replies from others**).

#### افعل / لا تفعل (عربي)

**افعل**
- نادِ هيرميس بـ @الرقم أو اكتب `هيرميس` / `Hermes` فقط عند الحاجة
- استخدم قروب allowlist واحد أو اثنين كحد أقصى
- أبقِ الردود قصيرة؛ مهمة واحدة في كل مرة
- أعد تشغيل البوابة بعد تغيير `.env` / `config.yaml`: `hermes gateway restart`

**لا تفعل**
- لا تطلب «رد على كل رسالة في القروب» (`REQUIRE_MENTION=false`) — يرفع خطر الحظر
- لا تفتح `WHATSAPP_ALLOWED_USERS=*` ولا تسمح لكل الغرباء
- لا تبثّ تذكيرات/cron تلقائية للقروب
- لا تنضم لقروبات كثيرة ولا توسّع الـ allowlist بلا داعٍ
- لا تستخدم رقمك الشخصي الأساسي إن أمكن — الرقم المخصص أفضل
- لا تفعّل تيليجرام/ديسكورد على هيرميس هنا؛ لا تلمس `@alhuda14bot`

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
- logs reconnect events (no Telegram alerts — Hermes is WA-only)

### Backup WhatsApp session (local only — never git)

```bash
npm run hermes:backup:wa
# → ~/Backups/hermes-wa/hermes-wa-YYYYMMDD-HHMMSS.tgz + .sha256 (mode 600)

npm run hermes:backup:wa:list
./scripts/hermes-backup-wa-session.sh --verify ~/Backups/hermes-wa/hermes-wa-….tgz
# Disaster recovery (stops gateway, restores session, restarts):
./scripts/hermes-backup-wa-session.sh --restore ~/Backups/hermes-wa/hermes-wa-….tgz
```

Includes: WhatsApp session tree + copies of `.env` and `config.yaml`.  
**Do not** put archives in git / shared iCloud folders. Keep an encrypted offsite copy of the `.tgz` if the Mac is your only copy.

Dedicated (safer) number later — optional, no rush: [hermes-wa-dedicated-number.md](./hermes-wa-dedicated-number.md)

Google Drive working folder for WA: [hermes-wa-drive.md](./hermes-wa-drive.md) (`1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw` — OAuth as `ryodan71@gmail.com`).

### Arabic replies / مساعدة (بدون زيادة سبام)

- Help = **رسالة واحدة** من SOUL / مهارة `ar-help` — لا تتبّع بنصائح إضافية إلا إذا طُلب.
- أبقِ `WHATSAPP_REQUIRE_MENTION=true` و`CHUNK_DELAY` — جودة العربية من الاختصار لا من كثرة الردود.
- عند «مساعدة»: الصق كتلة الأوامر العربية الجاهزة فقط ثم اصمت.

### Arabic commands (WhatsApp)

| User types | Effect |
|------------|--------|
| `/help` · `مساعدة` · `/مساعدة` | Short Arabic command list (`~/.hermes/SOUL.md` + skill `ar-help`) |
| `/status` · `حالة` | Session/status |
| `/new` · `جديد` | New chat |

Do **not** point Hermes at ArabicBuzz `@alhuda14bot`. Do **not** re-enable Hermes Telegram unless explicitly requested.

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
- Re-enable Hermes Telegram / touch `@alhuda14bot` while configuring WA.

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
| `hermes gateway` launchd — **WhatsApp only** | Scan WhatsApp QR (`hermes whatsapp`) if you accept Baileys risk |
| WA group join/allowlist scripts + `hermes-wa-watchdog` | Share invite links / confirm @mention in group |
| Session backup → `~/Backups/hermes-wa/` | Offsite copy of `.tgz` if desired (never git) |
| Optional `hermes-serve` LaunchAgent (Desktop-safe) | Leave Hermes.app open when using Desktop UI |
| Telegram `@waqfBbot` disconnected from Hermes | Optional: BotFather → `/deletebot` → `@waqfBbot` |
| Docs + install scripts in repo | **Not** Discord/Slack/Telegram on Hermes unless asked |
| **Did not** touch ArabicBuzz `@alhuda14bot` webhook | — |

Refs: [Hermes messaging overview](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) · [deploy/mac-hop](../deploy/mac-hop/README.md)
