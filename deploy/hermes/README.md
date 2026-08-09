# Hermes Mac helpers (WhatsApp Baileys)

Scripts and LaunchAgents for Hermes on this Mac. **Secrets stay in `~/.hermes/` — never commit `.env` or WhatsApp session files.**

| Script | Purpose |
|--------|---------|
| [`scripts/hermes-wa-join-invite.mjs`](../../scripts/hermes-wa-join-invite.mjs) | Accept `chat.whatsapp.com` invite via Baileys (`groupAcceptInvite`) |
| [`scripts/hermes-wa-allowlist-sync.sh`](../../scripts/hermes-wa-allowlist-sync.sh) | Merge `@g.us` into `WHATSAPP_GROUP_ALLOWED_USERS` + `config.yaml` |
| [`scripts/hermes-wa-watchdog.sh`](../../scripts/hermes-wa-watchdog.sh) | Auto-allowlist from logs + restart on disconnect |
| [`scripts/hermes-backup-wa-session.sh`](../../scripts/hermes-backup-wa-session.sh) | Backup session + `.env` → `~/Backups/hermes-wa/` |
| [`scripts/install-hermes-wa-watchdog-launchd.sh`](../../scripts/install-hermes-wa-watchdog-launchd.sh) | Install WA watchdog LaunchAgent |
| [`scripts/install-hermes-serve-launchd.sh`](../../scripts/install-hermes-serve-launchd.sh) | Optional `hermes serve` LaunchAgent (Desktop-safe) |

Docs: [docs/hermes-mac-always-on.md](../../docs/hermes-mac-always-on.md)

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
