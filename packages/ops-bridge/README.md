# @arabic-buzz/ops-bridge

Private-ready Mac/VPS bridge helpers for Arabic Buzz on Netlify.

Netlify functions cannot spawn stdio MCP servers (`filesystem`, `markitdown`, Playwright, …). Run those on a Mac or VPS, expose them with **Supergateway** (or the built-in **Mac sync agent**), then point Netlify env vars at the HTTPS tunnel URL.

## Quick start (Mac)

```bash
# Preferred product path — vault + browser-use + MarkItDown + /health
npm run storage:setup
# tunnel:
npx ngrok http 7420

# Netlify:
#   MAC_SYNC_URL=https://xxxx.ngrok-free.app
#   MAC_SYNC_SECRET=<same secret>
#   BRAIN_PRIMARY=mac   # optional
```

## Supergateway presets

```bash
node packages/ops-bridge/bin/ab-ops-bridge.mjs list
OPS_BRIDGE_PORT=8001 node packages/ops-bridge/bin/ab-ops-bridge.mjs filesystem
OPS_BRIDGE_PORT=8002 GITHUB_PERSONAL_ACCESS_TOKEN=ghp_… \
  node packages/ops-bridge/bin/ab-ops-bridge.mjs github
```

Then on Netlify:

```env
MCP_REMOTE_SERVERS=[{"id":"filesystem","name":"ملفات","url":"https://your-tunnel/mcp"}]
# or
MCP_GITHUB_URL=https://your-tunnel/mcp
```

## Healthcheck

```bash
MAC_SYNC_URL=https://xxxx.ngrok-free.app MAC_SYNC_SECRET=… \
  node packages/ops-bridge/bin/healthcheck.mjs
```

Mac sync agent exposes `GET /health` (Bearer secret optional depending on agent build).

## Netlify env map

| Variable | Purpose |
|----------|---------|
| `MAC_SYNC_URL` | Mac agent (vault, `/task`, `/markitdown`, `/health`) |
| `MAC_SYNC_SECRET` | Bearer for Mac agent |
| `BROWSER_USE_URL` | Optional dedicated browser-use bridge (else Mac `/task`) |
| `BROWSER_USE_SECRET` | Bearer for dedicated bridge |
| `STEEL_API_KEY` | Cloud failover for `browser_rpa` |
| `MCP_TOOLBOX_URL` | Google MCP Toolbox Streamable HTTP (`…/mcp`) |
| `MCP_REMOTE_SERVERS` | JSON array of `{id,name,url}` |
| `MCP_GITHUB_URL` | GitHub MCP via Supergateway (optional) |
| `FIRECRAWL_API_KEY` | Optional scrape upgrade (free path: Jina Reader + fetch) |
| `BRAVE_API_KEY` | Optional `web_search` upgrade (free path: DDG / Wikipedia / gov.sa) |
| `LANGFUSE_*` | Optional Cloud OTel tracing (free hobby signup) |

See [docs/ops-spine.md](../../docs/ops-spine.md) for Toolbox container deploy and full checklist.
