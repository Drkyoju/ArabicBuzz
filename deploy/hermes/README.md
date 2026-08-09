# Hermes Mac helpers (WhatsApp Baileys)

Scripts and LaunchAgents for Hermes on this Mac. **WhatsApp only** — never reconnect Telegram / `@waqfBbot`. **Secrets stay in `~/.hermes/` — never commit `.env` or WhatsApp session files.** ArabicBuzz Telegram (`@alhuda14bot`) and site agents live in this repo (`lib/telegram`, `lib/agents`) — parallel free capabilities, not one merged bot.

| Script | Purpose |
|--------|---------|
| [`scripts/hermes-wa-join-invite.mjs`](../../scripts/hermes-wa-join-invite.mjs) | Accept `chat.whatsapp.com` invite via Baileys (`groupAcceptInvite`) |
| [`scripts/hermes-wa-allowlist-sync.sh`](../../scripts/hermes-wa-allowlist-sync.sh) | Merge `@g.us` into `WHATSAPP_GROUP_ALLOWED_USERS` + `config.yaml` |
| [`scripts/hermes-wa-watchdog.sh`](../../scripts/hermes-wa-watchdog.sh) | Auto-allowlist from logs + restart on disconnect |
| [`scripts/hermes-backup-wa-session.sh`](../../scripts/hermes-backup-wa-session.sh) | Backup / verify / restore session → `~/Backups/hermes-wa/` |
| [`scripts/hermes-drive-setup.sh`](../../scripts/hermes-drive-setup.sh) | Drive OAuth status / `--from-arabicbuzz` / probe |
| [`scripts/hermes-wa-drive-archive.sh`](../../scripts/hermes-wa-drive-archive.sh) | Archive file → الوقف / status / search (anti-ban delay) |
| [`scripts/hermes-file-read.sh`](../../scripts/hermes-file-read.sh) | Free PDF/DOCX/text + light OCR (tesseract ara+eng) via `~/.hermes/docs-venv` |
| [`scripts/hermes-jina-fetch.sh`](../../scripts/hermes-jina-fetch.sh) | Free URL→text via Jina Reader (no key) |
| [`scripts/hermes-tools-status.sh`](../../scripts/hermes-tools-status.sh) | MCP/Drive/OCR health summary (no secrets) |
| [`scripts/hermes-skills-sync.sh`](../../scripts/hermes-skills-sync.sh) | Pack/restore local skills + SOUL + MCP list (no secrets); Nous Skill Sync still admin-gated |
| [`scripts/install-hermes-wa-watchdog-launchd.sh`](../../scripts/install-hermes-wa-watchdog-launchd.sh) | Install WA watchdog LaunchAgent |
| [`scripts/install-hermes-serve-launchd.sh`](../../scripts/install-hermes-serve-launchd.sh) | Optional `hermes serve` LaunchAgent (Desktop-safe) |

Docs: [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md) · [docs/hermes-wa-dedicated-number.md](../../docs/hermes-wa-dedicated-number.md) (future safer number — optional) · [docs/hermes-wa-drive.md](../../docs/hermes-wa-drive.md) (Google Drive working folder + WA archive)

## Google Drive (working folder)

Default WA Drive folder ID: `1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw`  
OAuth + probe (local secrets in `~/.hermes/` only):

```bash
npm run hermes:drive:status
./scripts/hermes-drive-setup.sh --from-arabicbuzz   # preferred
./scripts/hermes-drive-setup.sh --probe
npm run hermes:drive:archive:status
```

WhatsApp → Drive archive (mention-gated in group; not silent auto-archive):

```bash
./scripts/hermes-wa-drive-archive.sh --archive /path/to/local/file
./scripts/hermes-wa-drive-archive.sh --search 'كلمة'
./scripts/hermes-file-read.sh /path/to/file.pdf
./scripts/hermes-tools-status.sh
./scripts/hermes-skills-sync.sh status
./scripts/hermes-skills-sync.sh pack    # → ~/.hermes/backups/skills-portable/ (never git)
```

Does **not** change ArabicBuzz `GOOGLE_DRIVE_BRAIN_FOLDER_ID` on CranL.

Multi-device: Nous login follows the account; custom skills / SOUL / MCP / Drive tokens / WA session do **not** until Skill Sync GA — see [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md#multi-device--حساب-نووس-vs-قرص-محلي).

## Session backup

```bash
npm run hermes:backup:wa              # create .tgz + sha256
npm run hermes:backup:wa:list         # list archives
./scripts/hermes-backup-wa-session.sh --verify ~/Backups/hermes-wa/hermes-wa-….tgz
./scripts/hermes-backup-wa-session.sh --restore ~/Backups/hermes-wa/hermes-wa-….tgz
```

Never commit `~/Backups/hermes-wa/` or `~/.hermes/`.

## Install watchdogs

```bash
./scripts/install-hermes-wa-watchdog-launchd.sh
./scripts/install-hermes-serve-launchd.sh   # optional
```

## Join + allowlist example

```bash
node scripts/hermes-wa-join-invite.mjs 'https://chat.whatsapp.com/EXhnU7Vlul7LIcDsYvVBAg'
./scripts/hermes-wa-allowlist-sync.sh --add '120363429457422075@g.us'
# gateway restart is included by the scripts unless --no-restart
```

Test in group **عمل الوقف**: `@` mention Hermes number, or write `هيرميس` / `Hermes`.

**Anti-ban / وضع آمن:** keep `WHATSAPP_REQUIRE_MENTION=true`, ignore unauthorized DMs, slow chunk delay (`WHATSAPP_CHUNK_DELAY_MS=1800`), and do **not** ask Hermes to reply to every group message. Baileys is unofficial — residual ban risk remains. See [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md#anti-ban--وضع-آمن-configured-on-this-mac).
